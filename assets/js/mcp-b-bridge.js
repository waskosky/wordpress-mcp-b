(function () {
  // Prevent multiple initializations.
  if (window.WordPressMcpBServer) {
    return;
  }

  const channelId = 'mcp-default';
  const allowedOrigins = ['*'];
  let clientOrigin = null;

  /**
   * Check if the given origin is allowed to communicate with this transport.
   *
   * @param {string} origin The message origin.
   * @returns {boolean} Whether the origin is allowed.
   */
  function isAllowed(origin) {
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  }

  /**
   * Send a message back to the connected client.
   *
   * @param {Object} payload The JSON-RPC message payload to send.
   */
  function postToClient(payload) {
    console.debug('[MCP-B Bridge] postToClient', payload);
    if (!clientOrigin) {
      return;
    }

    window.postMessage(
      {
        channel: channelId,
        type: 'mcp',
        direction: 'server-to-client',
        payload,
      },
      clientOrigin
    );
  }

  /**
   * Send a JSON-RPC error back to the client.
   *
   * @param {number|null} id  The request id.
   * @param {string}      msg The error message.
   */
  function postError(id, msg) {
    postToClient({
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: -32000,
        message: msg,
      },
    });
  }

  // Handle incoming postMessage traffic from TabClientTransport.
  function handleMessage(event) {
    console.debug('[MCP-B Bridge] received', event.data);
    try {
      if (!isAllowed(event.origin)) {
        return;
      }

      const { data } = event;

      // Basic validation of envelope structure.
      if (
        !data ||
        data.channel !== channelId ||
        data.type !== 'mcp' ||
        data.direction !== 'client-to-server'
      ) {
        return;
      }

      clientOrigin = event.origin;

      const payload = data.payload;

      // Respond to discovery pings from TabClientTransport implementations that start
      // listening *after* the initial broadcast. This mirrors how ExtensionServerTransport
      // works in the reference implementation.
      if (payload === 'mcp-discover' || payload === 'mcp-ping') {
        // Re-broadcast server ready so the late listener can resolve.
        window.postMessage(
          {
            channel: channelId,
            type: 'mcp',
            direction: 'server-to-client',
            payload: 'mcp-server-ready',
          },
          '*'
        );
        return;
      }

      if (!payload || typeof payload !== 'object') {
        return postError(null, 'Invalid payload');
      }

      // Forward the JSON-RPC payload to the MCP Streamable REST endpoint.
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };

      if (WPMCPB.rest_nonce) {
        headers['X-WP-Nonce'] = WPMCPB.rest_nonce;
      }

      fetch(WPMCPB.streamable_endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(payload),
      })
        .then((resp) => {
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          return resp.json();
        })
        .then((result) => {
          postToClient(result);
        })
        .catch((err) => {
          postError(payload.id ?? null, err.message);
        });
    } catch (err) {
      console.error('MCP-B bridge error:', err);
    }
  }

  // Listen for messages from the client.
  window.addEventListener('message', handleMessage);

  // Helper to broadcast server-ready multiple times to catch late listeners.
  const readyEnvelope = {
    channel: channelId,
    type: 'mcp',
    direction: 'server-to-client',
    payload: 'mcp-server-ready',
  };


  // Broadcast the server-ready envelope on a back-off schedule for up to 10 seconds
  // or until a client connection is detected (clientOrigin is set). This ensures
  // extensions that inject after the initial page load still receive the ready
  // signal without requiring them to proactively ping the page.

  const broadcastIntervals = [0, 500, 1500, 3000, 5000, 7000, 10000];
  broadcastIntervals.forEach((delay) => {
    setTimeout(() => {
      if (!clientOrigin) {
        window.postMessage(readyEnvelope, '*');
      }
    }, delay);
  });

  window.WordPressMcpBServer = true;
})();
