import authHandler from '../../auth.js'

export default function googleOAuthCallback(req, res) {
  req.query = { ...req.query, action: 'callback', provider: 'google' }
  return authHandler(req, res)
}
