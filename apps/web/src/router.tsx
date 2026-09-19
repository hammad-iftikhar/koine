import { createBrowserRouter } from 'react-router'
import { Home } from './routes/Home'
import { PreJoin } from './routes/PreJoin'

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/j/:code', element: <PreJoin /> },
])
