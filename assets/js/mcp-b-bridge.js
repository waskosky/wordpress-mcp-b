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

  // Notify any clients that the server is ready.
  window.postMessage(
    {
      channel: channelId,
      type: 'mcp',
      direction: 'server-to-client',
      payload: 'mcp-server-ready',
    },
    '*'
  );

  window.WordPressMcpBServer = true;
})();
