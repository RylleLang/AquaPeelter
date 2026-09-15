/**
 * SensorReading — Time-series schema for ESP32 telemetry payloads.
 *
 * Optimized for:
 *  - High-frequency chronological writes from NodeMCU
 *  - Fast range queries by deviceId + timestamp (compound index)
 *  - Automatic TTL expiry of raw data after 90 days to control storage
 *
 * Units:
 *  ph        — pH scale 0–14
 *  turbidity — NTU (Nephelometric Turbidity Units)
 *  tds       — ppm (Total Dissolved Solids, parts per million)
 *  temperature — °C (optional, if sensor present)
 */

const mongoose = require('mongoose');

const SensorReadingSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },

    ph: {
      type: Number,
      required: true,
      min: [0, 'pH cannot be below 0'],
      max: [14, 'pH cannot exceed 14'],
    },

    turbidity: {
      type: Number,
      required: true,
      min: [0, 'Turbidity cannot be negative'],
      // WHO potable water limit: < 1 NTU; wastewater can be 100–1000+ NTU
    },

    tds: {
      type: Number,
      required: true,
      min: [0, 'TDS cannot be negative'],
      // ppm — EPA secondary standard: < 500 ppm for drinking water
    },

    temperature: {
      type: Number,
      default: null,
    },

    // Filtration cycle this reading belongs to
    cycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FiltrationCycle',
      default: null,
    },

    // Pre-filter vs post-filter sample point
    samplePoint: {
      type: String,
      enum: ['pre-filter', 'post-filter'],
      required: true,
    },

    // Raw payload checksum for integrity auditing
    payloadChecksum: {
      type: String,
      default: null,
    },
  },
  {
    // Disable default _id version key overhead on high-volume collection
    versionKey: false,
    // Use explicit timestamps: false — we manage `timestamp` ourselves
    timestamps: false,
  }
);

// -------------------------------------------------------------------
// INDEXES
// -------------------------------------------------------------------

// Primary query: fetch readings for a device over a time window
SensorReadingSchema.index({ deviceId: 1, timestamp: -1 });

// Cycle-level aggregation queries
SensorReadingSchema.index({ cycleId: 1, samplePoint: 1 });

// TTL index — automatically purge raw readings after 90 days
SensorReadingSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

// -------------------------------------------------------------------
// VIRTUALS
// -------------------------------------------------------------------

// Determine water quality tier based on post-filter readings
SensorReadingSchema.virtual('qualityTier').get(function () {
  if (this.samplePoint !== 'post-filter') return null;
  const { ph, turbidity, tds } = this;

  if (ph >= 6.5 && ph <= 8.5 && turbidity < 5 && tds < 500) return 'safe';
  if (ph >= 5.5 && ph <= 9.0 && turbidity < 50 && tds < 1000) return 'reuse';
  return 'unsafe';
});

// -------------------------------------------------------------------
// STATICS
// -------------------------------------------------------------------

// Aggregate average readings for a device over a time range
SensorReadingSchema.statics.getAveragesForRange = async function (
  deviceId,
  startDate,
  endDate,
  samplePoint = 'post-filter'
) {
  return this.aggregate([
    {
      $match: {
        deviceId,
        samplePoint,
        timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) },
      },
    },
    {
      $group: {
        _id: null,
        avgPh: { $avg: '$ph' },
        avgTurbidity: { $avg: '$turbidity' },
        avgTds: { $avg: '$tds' },
        minPh: { $min: '$ph' },
        maxPh: { $max: '$ph' },
        minTurbidity: { $min: '$turbidity' },
        maxTurbidity: { $max: '$turbidity' },
        readingCount: { $sum: 1 },
      },
    },
  ]);
};

// Paginated time-series data for chart rendering
SensorReadingSchema.statics.getTimeSeries = async function (
  deviceId,
  { startDate, endDate, samplePoint = 'post-filter', limit = 200, skip = 0 }
) {
  return this.find({
    deviceId,
    samplePoint,
    timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) },
  })
    .sort({ timestamp: 1 })
    .skip(skip)
    .limit(limit)
    .select('timestamp ph turbidity tds -_id')
    .lean();
};

module.exports = mongoose.model('SensorReading', SensorReadingSchema);
