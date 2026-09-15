const DeviceState = require('../models/DeviceState');
const FiltrationCycle = require('../models/FiltrationCycle');
const User = require('../models/User');
const {
  notifyCycleStarted,
  notifyCycleCompleted,
  notifyCyclePaused,
} = require('../services/notificationService');
const { evaluateFilterHealth } = require('../services/filterHealthService');
const SensorReading = require('../models/SensorReading');
const logger = require('../config/logger');

/**
 * GET /api/device/:deviceId/state
 * Returns the full current state of a device (for dashboard mount).
 */
exports.getState = async (req, res) => {
  const { deviceId } = req.params;

  try {
    const state = await DeviceState.findOne({ deviceId })
      .populate('activeCycleId', 'startedAt cycleNumber status')
      .lean({ virtuals: true });

    if (!state) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    res.status(200).json({ success: true, data: state });
  } catch (err) {
    logger.error(`getState error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch device state' });
  }
};

/**
 * PATCH /api/device/:deviceId/power
 * Body: { isPoweredOn: true | false }
 * Toggles master power state of the device.
 */
exports.setPower = async (req, res) => {
  const { deviceId } = req.params;
  const { isPoweredOn } = req.body;

  if (typeof isPoweredOn !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'isPoweredOn must be a boolean',
    });
  }

  try {
    const state = await DeviceState.upsertState(deviceId, {
      $set: { isPoweredOn },
    });

    // If powering off, abort any active cycle
    if (!isPoweredOn && state.activeCycleId) {
      await FiltrationCycle.findByIdAndUpdate(state.activeCycleId, {
        status: 'aborted',
        completedAt: new Date(),
      });
      await DeviceState.upsertState(deviceId, {
        $set: { cycleStatus: 'idle', activeCycleId: null },
      });
    }

    logger.info(`Device ${deviceId} powered ${isPoweredOn ? 'ON' : 'OFF'}`);
    res.status(200).json({ success: true, data: { isPoweredOn } });
  } catch (err) {
    logger.error(`setPower error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to update power state' });
  }
};

/**
 * POST /api/device/:deviceId/cycle/start
 * Starts a new filtration cycle.
 */
exports.startCycle = async (req, res) => {
  const { deviceId } = req.params;

  try {
    // May be null for a device that has never reported or been controlled before
    const state = await DeviceState.findOne({ deviceId });

    // A running OR paused cycle is still the active cycle — starting another would
    // orphan it (activeCycleId overwritten, never completed).
    if (state?.cycleStatus === 'running' || (state?.cycleStatus === 'paused' && state.activeCycleId)) {
      return res.status(409).json({
        success: false,
        message:
          state.cycleStatus === 'paused'
            ? 'A filtration cycle is paused — resume or finish it first'
            : 'A filtration cycle is already running',
      });
    }

    // Number by cycles ever created for this device (aborted ones included) so
    // numbers are unique. totalCycles only counts completions and would repeat.
    const cycleNumber = (await FiltrationCycle.countDocuments({ deviceId })) + 1;

    // Self-heal: any cycle left running/paused that is not the active one was
    // orphaned by an earlier bug — mark it aborted so history stays truthful.
    await FiltrationCycle.updateMany(
      { deviceId, status: { $in: ['running', 'paused'] } },
      { $set: { status: 'aborted', completedAt: new Date() } }
    );

    const cycle = await FiltrationCycle.create({
      deviceId,
      cycleNumber,
      startedAt: new Date(),
      status: 'running',
    });

    // Starting a cycle implicitly powers the device on — the mobile app has no
    // separate power toggle, so the power flag must not gate cycle start.
    await DeviceState.upsertState(deviceId, {
      $set: {
        isPoweredOn: true,
        cycleStatus: 'running',
        activeCycleId: cycle._id,
      },
    });

    // Push notification (fire-and-forget)
    const users = await User.find({ deviceIds: deviceId }).select('expoPushTokens');
    const tokens = users.flatMap((u) => u.expoPushTokens);
    if (tokens.length > 0) notifyCycleStarted(tokens, cycleNumber);

    logger.info(`Cycle #${cycleNumber} started on device ${deviceId}`);
    res.status(201).json({
      success: true,
      data: { cycleId: cycle._id, cycleNumber, cycleStatus: 'running' },
    });
  } catch (err) {
    logger.error(`startCycle error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to start filtration cycle' });
  }
};

/**
 * PATCH /api/device/:deviceId/cycle/pause
 * Pauses or resumes the active filtration cycle.
 */
exports.togglePause = async (req, res) => {
  const { deviceId } = req.params;

  try {
    const state = await DeviceState.findOne({ deviceId });

    if (!state?.activeCycleId) {
      return res.status(409).json({
        success: false,
        message: 'No active cycle to pause/resume',
      });
    }

    const currentStatus = state.cycleStatus;
    const newStatus = currentStatus === 'running' ? 'paused' : 'running';

    await Promise.all([
      FiltrationCycle.findByIdAndUpdate(state.activeCycleId, {
        status: newStatus,
      }),
      DeviceState.upsertState(deviceId, {
        $set: { cycleStatus: newStatus },
      }),
    ]);

    const users = await User.find({ deviceIds: deviceId }).select('expoPushTokens');
    const tokens = users.flatMap((u) => u.expoPushTokens);

    if (newStatus === 'paused' && tokens.length > 0) {
      const cycle = await FiltrationCycle.findById(state.activeCycleId).lean();
      notifyCyclePaused(tokens, cycle.cycleNumber);
    }

    logger.info(`Cycle on device ${deviceId} set to: ${newStatus}`);
    res.status(200).json({ success: true, data: { cycleStatus: newStatus } });
  } catch (err) {
    logger.error(`togglePause error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to toggle cycle pause' });
  }
};

/**
 * POST /api/device/:deviceId/cycle/complete
 * Marks the active cycle as completed.
 * Called either by the ESP32 when done or manually by the user.
 */
exports.completeCycle = async (req, res) => {
  const { deviceId } = req.params;

  try {
    const state = await DeviceState.findOne({ deviceId });

    if (!state?.activeCycleId) {
      return res.status(409).json({
        success: false,
        message: 'No active cycle to complete',
      });
    }

    const cycle = await FiltrationCycle.findById(state.activeCycleId);
    if (!cycle) {
      return res.status(404).json({ success: false, message: 'Active cycle not found' });
    }

    // Aggregate pre and post-filter averages for cycle summary
    const startDate = cycle.startedAt;
    const endDate = new Date();

    const [preAvgArr, postAvgArr] = await Promise.all([
      SensorReading.getAveragesForRange(deviceId, startDate, endDate, 'pre-filter'),
      SensorReading.getAveragesForRange(deviceId, startDate, endDate, 'post-filter'),
    ]);

    await cycle.finalize(preAvgArr[0] || {}, postAvgArr[0] || {});

    // Self-heal orphaned cycles (see startCycle) — everything else still
    // running/paused on this device is stale once the active cycle completes.
    await FiltrationCycle.updateMany(
      { deviceId, _id: { $ne: cycle._id }, status: { $in: ['running', 'paused'] } },
      { $set: { status: 'aborted', completedAt: new Date() } }
    );

    await DeviceState.upsertState(deviceId, {
      $set: {
        cycleStatus: 'completed',
        activeCycleId: null,
      },
    });

    // Update filter health + push notification
    await evaluateFilterHealth(deviceId);

    const users = await User.find({ deviceIds: deviceId }).select('expoPushTokens');
    const tokens = users.flatMap((u) => u.expoPushTokens);
    if (tokens.length > 0) {
      notifyCycleCompleted(tokens, cycle.cycleNumber, cycle.durationSeconds);
    }

    logger.info(`Cycle #${cycle.cycleNumber} completed on device ${deviceId}`);
    res.status(200).json({ success: true, data: { cycleId: cycle._id, summary: cycle.summary } });
  } catch (err) {
    logger.error(`completeCycle error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to complete cycle' });
  }
};

/**
 * GET /api/device/:deviceId/cycles
 * Returns paginated list of past filtration cycles.
 */
exports.getCycles = async (req, res) => {
  const { deviceId } = req.params;
  const { limit = 20, skip = 0 } = req.query;

  try {
    const [cycles, total] = await Promise.all([
      FiltrationCycle.find({ deviceId })
        .sort({ startedAt: -1 })
        .skip(parseInt(skip))
        .limit(Math.min(parseInt(limit), 100))
        .lean(),
      FiltrationCycle.countDocuments({ deviceId }),
    ]);

    res.status(200).json({
      success: true,
      total,
      count: cycles.length,
      data: cycles,
    });
  } catch (err) {
    logger.error(`getCycles error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch cycles' });
  }
};
