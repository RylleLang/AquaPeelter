/**
 * Unit tests for POST /api/device/:deviceId/cycle/start
 *
 * Runs without MongoDB — models and services are mocked. Guards the
 * regression where a device that had never been "powered on" could not
 * start a cycle (the mobile app has no power toggle).
 */

jest.mock('../src/models/DeviceState');
jest.mock('../src/models/FiltrationCycle');
jest.mock('../src/models/User');
jest.mock('../src/models/SensorReading');
jest.mock('../src/services/notificationService');
jest.mock('../src/services/filterHealthService');
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const DeviceState = require('../src/models/DeviceState');
const FiltrationCycle = require('../src/models/FiltrationCycle');
const User = require('../src/models/User');
const { notifyCycleStarted } = require('../src/services/notificationService');
const { startCycle } = require('../src/controllers/deviceController');

const DEVICE_ID = 'esp32-aquafilter-001';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = () => ({ params: { deviceId: DEVICE_ID } });

beforeEach(() => {
  jest.clearAllMocks();
  FiltrationCycle.create.mockResolvedValue({ _id: 'cycle-1' });
  FiltrationCycle.countDocuments.mockResolvedValue(0);
  FiltrationCycle.updateMany.mockResolvedValue({ modifiedCount: 0 });
  DeviceState.upsertState.mockResolvedValue({});
  User.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
});

describe('startCycle', () => {
  test('starts a cycle for a device with no DeviceState document yet', async () => {
    DeviceState.findOne.mockResolvedValue(null);
    const res = mockRes();

    await startCycle(mockReq(), res);

    expect(FiltrationCycle.create).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: DEVICE_ID, cycleNumber: 1, status: 'running' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { cycleId: 'cycle-1', cycleNumber: 1, cycleStatus: 'running' },
    });
  });

  test('starts a cycle when the device is powered off (no power gate)', async () => {
    DeviceState.findOne.mockResolvedValue({
      isPoweredOn: false,
      cycleStatus: 'idle',
      totalCycles: 4,
    });
    FiltrationCycle.countDocuments.mockResolvedValue(4);
    const res = mockRes();

    await startCycle(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(FiltrationCycle.create).toHaveBeenCalledWith(
      expect.objectContaining({ cycleNumber: 5 })
    );
  });

  test('marks the device powered on and running in the same upsert', async () => {
    DeviceState.findOne.mockResolvedValue({ isPoweredOn: false, cycleStatus: 'idle', totalCycles: 0 });

    await startCycle(mockReq(), mockRes());

    expect(DeviceState.upsertState).toHaveBeenCalledWith(DEVICE_ID, {
      $set: { isPoweredOn: true, cycleStatus: 'running', activeCycleId: 'cycle-1' },
    });
  });

  test('rejects with 409 when a cycle is already running', async () => {
    DeviceState.findOne.mockResolvedValue({ isPoweredOn: true, cycleStatus: 'running', totalCycles: 2 });
    const res = mockRes();

    await startCycle(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'A filtration cycle is already running',
    });
    expect(FiltrationCycle.create).not.toHaveBeenCalled();
    expect(DeviceState.upsertState).not.toHaveBeenCalled();
  });

  test('rejects with 409 when a cycle is paused (still active)', async () => {
    DeviceState.findOne.mockResolvedValue({
      isPoweredOn: true,
      cycleStatus: 'paused',
      activeCycleId: 'cycle-7',
      totalCycles: 7,
    });
    const res = mockRes();

    await startCycle(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'A filtration cycle is paused — resume or finish it first',
    });
    expect(FiltrationCycle.create).not.toHaveBeenCalled();
  });

  test('starts a new cycle after the previous one completed', async () => {
    DeviceState.findOne.mockResolvedValue({
      isPoweredOn: true,
      cycleStatus: 'completed',
      activeCycleId: null,
      totalCycles: 3,
    });
    FiltrationCycle.countDocuments.mockResolvedValue(3);
    const res = mockRes();

    await startCycle(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(FiltrationCycle.create).toHaveBeenCalledWith(
      expect.objectContaining({ cycleNumber: 4 })
    );
  });

  test('numbers cycles uniquely even when aborted cycles exist', async () => {
    DeviceState.findOne.mockResolvedValue({ cycleStatus: 'idle', activeCycleId: null, totalCycles: 2 });
    FiltrationCycle.countDocuments.mockResolvedValue(6); // 2 completed + 4 aborted

    await startCycle(mockReq(), mockRes());

    expect(FiltrationCycle.create).toHaveBeenCalledWith(expect.objectContaining({ cycleNumber: 7 }));
  });

  test('marks orphaned running/paused cycles as aborted before starting', async () => {
    DeviceState.findOne.mockResolvedValue({ cycleStatus: 'completed', activeCycleId: null, totalCycles: 1 });

    await startCycle(mockReq(), mockRes());

    expect(FiltrationCycle.updateMany).toHaveBeenCalledWith(
      { deviceId: DEVICE_ID, status: { $in: ['running', 'paused'] } },
      { $set: expect.objectContaining({ status: 'aborted' }) }
    );
  });

  test('sends a push notification only when users have tokens', async () => {
    DeviceState.findOne.mockResolvedValue(null);
    User.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([{ expoPushTokens: ['ExponentPushToken[abc]'] }]),
    });

    await startCycle(mockReq(), mockRes());

    expect(notifyCycleStarted).toHaveBeenCalledWith(['ExponentPushToken[abc]'], 1);
  });

  test('returns 500 when the database call fails', async () => {
    DeviceState.findOne.mockRejectedValue(new Error('connection lost'));
    const res = mockRes();

    await startCycle(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to start filtration cycle',
    });
  });
});
