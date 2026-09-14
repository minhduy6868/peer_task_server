const express = require('express');
const { sendError } = require('../middleware/errorHandler');
const router = express.Router();

// Ollama URL (local)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * AI Proxy Routes
 * Forward requests to local Ollama server
 * This allows mobile apps to access Ollama through the main server
 */

// Health check for Ollama
router.get('/health', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      res.json({ 
        status: 'ok', 
        ollama: OLLAMA_URL,
        models: data.models?.map(m => m.name) || []
      });
    } else {
      return sendError(res, 503, 'Ollama not responding', 'SERVER_ERROR');
    }
  } catch (error) {
    return sendError(res, 503, 'Cannot connect to Ollama', 'SERVER_ERROR');
  }
});

// Get available models
router.get('/tags', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    return sendError(res, 503, 'Cannot connect to Ollama', 'SERVER_ERROR');
  }
});

// Generate (non-streaming)
router.post('/generate', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, stream: false })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    return sendError(res, 503, 'Cannot connect to Ollama', 'SERVER_ERROR');
  }
});

// Generate (streaming)
router.post('/generate/stream', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, stream: true })
    });

    if (!response.ok) {
      return sendError(res, response.status, 'Ollama error', 'SERVER_ERROR');
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (error) {
    console.error('Ollama stream error:', error);
    return sendError(res, 503, 'Cannot connect to Ollama', 'SERVER_ERROR');
  }
});

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req.body, stream: false })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    return sendError(res, 503, 'Cannot connect to Ollama', 'SERVER_ERROR');
  }
});

module.exports = router;
