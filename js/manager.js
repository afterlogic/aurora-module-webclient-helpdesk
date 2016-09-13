'use strict';

module.exports = function (oAppData) {
	require('modules/%ModuleName%/js/enums.js');
	
	require('modules/%ModuleName%/js/koBindings.js');

	var
		_ = require('underscore'),
		
		App = require('%PathToCoreWebclientModule%/js/App.js'),
		
		TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
				
		Settings = require('modules/%ModuleName%/js/Settings.js'),
		oSettings = _.extend({}, oAppData[Settings.ServerModuleName] || {}, oAppData['%ModuleName%'] || {}),
		CheckState = require('modules/%ModuleName%/js/CheckState.js')
	;
	
	Settings.init(oSettings);
	
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
	else if (App.getUserRole() === Enums.UserRole.NormalUser || App.getUserRole() === Enums.UserRole.Customer)
	{
		return {
			start: function (ModulesManager) {
				ModulesManager.run('SettingsWebclient', 'registerSettingsTab', [function () { return require('modules/%ModuleName%/js/views/HelpdeskSettingsPaneView.js'); }, Settings.HashModuleName, TextUtils.i18n('%MODULENAME%/LABEL_SETTINGS_TAB')]);
			},
			getScreens: function () {
				var oScreens = {};
				oScreens[Settings.HashModuleName] = function () {
					return require('modules/%ModuleName%/js/views/HelpdeskView.js');
				};
				return oScreens;
			},
			getHeaderItem: function () {
				CheckState.start();
				return {
					item: require('modules/%ModuleName%/js/views/HeaderItemView.js'),
					name: Settings.HashModuleName
				};
			}
		};
	}
	
	return null;
};
