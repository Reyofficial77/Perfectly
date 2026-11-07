import authHandler from '../../auth.js'

export default function githubOAuthCallback(req, res) {
  req.query = { ...req.query, action: 'callback', provider: 'github' }
  return authHandler(req, res)
}
