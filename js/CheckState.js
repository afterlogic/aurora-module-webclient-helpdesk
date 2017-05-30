'use strict';

var
	_ = require('underscore'),
	
	Ajax = require('modules/%ModuleName%/js/Ajax.js'),
	App = require('%PathToCoreWebclientModule%/js/App.js'),
	UserSettings = require('%PathToCoreWebclientModule%/js/Settings.js'),
	
	Settings = require('modules/%ModuleName%/js/Settings.js'),
	HeaderItemView = require('modules/%ModuleName%/js/views/HeaderItemView.js'),
	
	bAgent = (App.getUserRole() === Enums.UserRole.NormalUser),
	iTimer = 0
;

function RequestThreads()
{
	Ajax.send('GetThreads', {
		'Offset': 0,
		'Limit': Settings.ThreadsPerPage,
		'Filter': bAgent ? Enums.HelpdeskFilters.Open : Enums.HelpdeskFilters.All,
		'Search': ''
	}, function (oResponse) {
		var
			aThreads = (oResponse.Result && _.isArray(oResponse.Result.List)) ? oResponse.Result.List : [],
			iUnseen = _.filter(aThreads, function (oThread) {
				return !oThread.IsRead;
			}, this).length
		;
		
		HeaderItemView.unseenCount(iUnseen);
		iTimer = setTimeout(RequestThreads, UserSettings.AutoRefreshIntervalMinutes * 60 * 1000)
	});
}

module.exports = {
	start: function () {
		if (UserSettings.AutoRefreshIntervalMinutes > 0)
		{
			RequestThreads();
		}
	},
	end: function () {
		clearTimeout(iTimer);
	}
};
