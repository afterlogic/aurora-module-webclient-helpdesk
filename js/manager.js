'use strict';

module.exports = function (oAppData) {
	var
		App = require('%PathToCoreWebclientModule%/js/App.js'),
		ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
		
		TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
				
		Settings = require('modules/%ModuleName%/js/Settings.js'),
		CheckState = require('modules/%ModuleName%/js/CheckState.js'),
		
		HeaderItemView = null
	;
	
	Settings.init(oAppData);
	
	if (!ModulesManager.isModuleAvailable(Settings.ServerModuleName))
	{
		return null;
	}
	
	require('modules/%ModuleName%/js/enums.js');
	require('modules/%ModuleName%/js/koBindings.js');

	if (App.isPublic())
	{
		return {
			getScreens: function () {
				var oScreens = {};
				oScreens[Settings.HashModuleName] = function () {
					return require('modules/%ModuleName%/js/views/LoginView.js');
				};
				return oScreens;
			}
		};
	}
	else if (App.isUserNormalOrTenant())
	{
		return {
			start: function (ModulesManager) {
				ModulesManager.run('SettingsWebclient', 'registerSettingsTab', [
					function () { return require('modules/%ModuleName%/js/views/HelpdeskSettingsFormView.js'); },
					Settings.HashModuleName,
					TextUtils.i18n('%MODULENAME%/LABEL_SETTINGS_TAB')
				]);
			},
			getScreens: function () {
				var oScreens = {};
				oScreens[Settings.HashModuleName] = function () {
					return require('modules/%ModuleName%/js/views/HelpdeskView.js');
				};
				return oScreens;
			},
			getHeaderItem: function () {
				if (HeaderItemView === null)
				{
					HeaderItemView = require('modules/%ModuleName%/js/views/HeaderItemView.js');
				}
				CheckState.start();
				return {
					item: HeaderItemView,
					name: Settings.HashModuleName
				};
			}
		};
	}
	
	return null;
};
