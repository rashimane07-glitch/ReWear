// Stops waiting for a promise after `ms` milliseconds, so a slow external
// service (Object Storage, ...) can never freeze a request forever.

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Request timed out.');
      error.code = 'ETIMEDOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = withTimeout;
