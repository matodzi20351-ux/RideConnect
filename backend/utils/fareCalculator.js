const PricingConfig = require('../models/PricingConfig');

/**
 * Calculates great-circle distance between two [lng, lat] points using the
 * Haversine formula. Returns distance in kilometres.
 */
function calculateDistanceKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth's radius in km

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Rough duration estimate assuming average urban driving speed of 30km/h.
 */
function estimateDurationMin(distanceKm) {
  const avgSpeedKmh = 30;
  return (distanceKm / avgSpeedKmh) * 60;
}

/**
 * Returns { distanceKm, estimatedDurationMin, fareEstimate } using the
 * active pricing config stored in the database, falling back to .env
 * defaults if no config document exists yet.
 */
async function calculateFare(pickupCoordinates, destinationCoordinates) {
  let config = await PricingConfig.findOne().sort({ createdAt: -1 });

  if (!config) {
    config = {
      baseFare: Number(process.env.BASE_FARE) || 15,
      costPerKm: Number(process.env.COST_PER_KM) || 6,
      costPerMin: Number(process.env.COST_PER_MIN) || 1.5,
      minimumFare: 25
    };
  }

  const distanceKm = calculateDistanceKm(pickupCoordinates, destinationCoordinates);
  const estimatedDurationMin = estimateDurationMin(distanceKm);

  let fareEstimate =
    config.baseFare + distanceKm * config.costPerKm + estimatedDurationMin * config.costPerMin;

  fareEstimate = Math.max(fareEstimate, config.minimumFare);

  return {
    distanceKm: Number(distanceKm.toFixed(2)),
    estimatedDurationMin: Number(estimatedDurationMin.toFixed(1)),
    fareEstimate: Number(fareEstimate.toFixed(2))
  };
}

module.exports = { calculateDistanceKm, estimateDurationMin, calculateFare };
