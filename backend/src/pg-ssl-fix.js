// src/pg-ssl-fix.js
import { defaults } from 'pg';

// Force the pg library to accept Neon's SSL certificate without strict validation.
// This prevents the TLS handshake from hanging on certain networks/VPNs.
defaults.ssl = { rejectUnauthorized: false };