// Set this to the HTTPS API origin when publishing the frontend separately.
const configuredElectionAPI = '';
const localPreview = location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
window.electionAPIBase = configuredElectionAPI || (localPreview ? 'http://127.0.0.1:8081' : '');
