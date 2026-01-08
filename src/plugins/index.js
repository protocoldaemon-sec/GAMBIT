/**
 * Gambit Plugins
 * Plugin system for modular functionality
 */
import TokenPlugin from "./token/index.js";
import DefiPlugin from "./defi/index.js";
import { mergePlugins, getAllActions } from "./base.js";

// All available plugins
export const plugins = {
  token: TokenPlugin,
  defi: DefiPlugin,
};

// Default plugins to load
export const defaultPlugins = [TokenPlugin, DefiPlugin];

// Merged plugin with all functionality
export const GambitPlugin = mergePlugins(defaultPlugins);

// All actions from all plugins
export const allActions = getAllActions(defaultPlugins);

/**
 * Get plugin by name
 */
export function getPlugin(name) {
  return plugins[name];
}

/**
 * Initialize all plugins
 */
export function initializePlugins(pluginList = defaultPlugins) {
  for (const plugin of pluginList) {
    if (plugin.initialize) {
      plugin.initialize();
    }
  }
}

/**
 * Get all methods from plugins
 */
export function getAllMethods(pluginList = defaultPlugins) {
  const methods = {};
  for (const plugin of pluginList) {
    Object.assign(methods, plugin.methods);
  }
  return methods;
}

export { TokenPlugin, DefiPlugin };
export default { plugins, defaultPlugins, GambitPlugin, allActions, getPlugin, initializePlugins, getAllMethods };
