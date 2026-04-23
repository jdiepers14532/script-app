import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ScriptPage from './pages/ScriptPage'
import EditorPage from './pages/EditorPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScriptPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
