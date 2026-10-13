module.exports = function handler(request, response) {
  response.setHeader('Cache-Control','no-store');
  if (request.method !== 'GET') return response.status(405).json({error:'method not allowed'});
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey || !/^https:\/\/.+\.supabase\.co\/?$/.test(url)) return response.status(503).json({error:'configuration unavailable'});
  return response.status(200).json({url,publishableKey});
};
