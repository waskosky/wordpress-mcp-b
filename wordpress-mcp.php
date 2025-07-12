<?php
/**
 * Plugin name:       WordPress MCP
 * Description:       A plugin to integrate WordPress with Model Context Protocol (MCP), providing AI-accessible interfaces to WordPress data and functionality through standardized tools, resources, and prompts. Enables AI assistants to interact with posts, users, site settings, and WooCommerce data.
 * Version:           0.2.3
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Automattic AI, Ovidiu Galatan <ovidiu.galatan@a8c.com>
 * Author URI:        https://automattic.com
 * License:           GPL-2.0-or-later
 * License URI:       https://spdx.org/licenses/GPL-2.0-or-later.html
 * Text Domain:       wordpress-mcp
 * Domain Path:       /languages
 *
 * @package WordPress MCP
 */

declare(strict_types=1);

use Automattic\WordpressMcp\Core\McpStreamableTransport;
use Automattic\WordpressMcp\Core\WpMcp;
use Automattic\WordpressMcp\Core\McpStdioTransport;
use Automattic\WordpressMcp\Admin\Settings;
use Automattic\WordpressMcp\Auth\JwtAuth;

define( 'WORDPRESS_MCP_VERSION', '0.2.3' );
define( 'WORDPRESS_MCP_PATH', plugin_dir_path( __FILE__ ) );
define( 'WORDPRESS_MCP_URL', plugin_dir_url( __FILE__ ) );

// Check if Composer autoloader exists.
if ( ! file_exists( WORDPRESS_MCP_PATH . 'vendor/autoload.php' ) ) {
	wp_die(
		sprintf(
			'Please run <code>composer install</code> in the plugin directory: <code>%s</code>',
			esc_html( WORDPRESS_MCP_PATH )
		)
	);
}

require_once WORDPRESS_MCP_PATH . 'vendor/autoload.php';

/**
 * Get the WordPress MCP instance.
 *
 * @return WpMcp
 */
function WPMCP() { // phpcs:ignore
	return WpMcp::instance();
}

/**
 * Initialize the plugin.
 */
function init_wordpress_mcp() {
	$mcp = WPMCP();

	// Initialize the STDIO transport.
	new McpStdioTransport( $mcp );

	// Initialize the Streamable transport.
	new McpStreamableTransport( $mcp );

	// Initialize the settings page.
	new Settings();

	// Initialize the JWT authentication.
	new JwtAuth();
}

// Initialize the plugin on plugins_loaded to ensure all dependencies are available.
add_action( 'plugins_loaded', 'init_wordpress_mcp' );

/**
 * Enqueue the MCP-B bridge script on the front-end so browser extensions using the
 * MCP-B Tab transport can communicate with the WordPress MCP server.
 */
function wordpress_mcp_enqueue_mcpb_bridge() {
	// Load only for logged-in users with MCP enabled.
	$options = get_option( 'wordpress_mcp_settings', array() );
	if ( ! ( isset( $options['enabled'] ) && $options['enabled'] ) ) {
		return;
	}

	$endpoint = rest_url( 'wp/v2/wpmcp/streamable' );

	wp_register_script(
		'wordpress-mcp-b-bridge',
		WORDPRESS_MCP_URL . 'assets/js/mcp-b-bridge.js',
		array(),
		WORDPRESS_MCP_VERSION,
		true
	);

	$rest_nonce = wp_create_nonce( 'wp_rest' );
	wp_localize_script(
		'wordpress-mcp-b-bridge',
		'WPMCPB',
		array(
			'streamable_endpoint' => esc_url_raw( $endpoint ),
			'rest_nonce'          => $rest_nonce,
		)
	);

	wp_enqueue_script( 'wordpress-mcp-b-bridge' );
}

add_action( 'wp_enqueue_scripts', 'wordpress_mcp_enqueue_mcpb_bridge' );
add_action( 'admin_enqueue_scripts', 'wordpress_mcp_enqueue_mcpb_bridge' );
