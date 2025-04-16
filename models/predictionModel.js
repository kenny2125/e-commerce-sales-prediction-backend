const brain = require('brain.js');

// Train and forecast sales using GRUTimeStep
function trainAndForecastGRU(series, options = {}) {
  const net = new brain.recurrent.GRUTimeStep({ gpu: false });
  const trainingOptions = {
    errorThresh: options.errorThresh || 0.1,
    log: options.log || false,
    logPeriod: options.logPeriod || 10000,
    callback: options.callback || undefined
  };
  net.train([series], trainingOptions);
  return net;
}

// Forecast future sales
function forecastSales(net, series, monthsAhead) {
  return net.forecast(series, monthsAhead);
}

module.exports = {
  trainAndForecastGRU,
  forecastSales
};
