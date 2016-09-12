'use strict';

var $ = require('jquery');

$('body').ready(function () {
	var
		oAvaliableModules = {
			'HelpDeskWebclient': require('modules/HelpDeskWebclient/js/manager-ext.js')
		},
		ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
		App = require('%PathToCoreWebclientModule%/js/App.js')
	;
	
	App.setPublic();
	ModulesManager.init(oAvaliableModules, App.getUserRole(), App.isPublic());
	App.init();
});
