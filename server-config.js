// Set this to the HTTPS API origin when publishing the frontend separately.
const configuredElectionAPI = 'https://elect114-api.student6744319.workers.dev';
const localPreview = location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
window.electionAPIBase = localPreview ? 'http://127.0.0.1:8081' : configuredElectionAPI;
