import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
(window as any).__GOOGLE_CLIENT_ID__ = clientId;

const root = ReactDOM.createRoot(rootElement);

// If no Google Client ID is configured, render without GoogleOAuthProvider
// to avoid "Missing required parameter client_id" error
const AppTree = clientId ? (
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
) : (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

root.render(AppTree);
