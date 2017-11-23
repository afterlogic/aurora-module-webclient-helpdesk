'use strict';

var
	_ = require('underscore'),
	ko = require('knockout'),
	
	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	CAbstractSettingsFormView = ModulesManager.run('SettingsWebclient', 'getAbstractSettingsFormViewClass'),
	
	Settings = require('modules/%ModuleName%/js/Settings.js')
;

/**
 * @constructor
 */
function CHelpdeskSettingsFormView()
{
	CAbstractSettingsFormView.call(this, Settings.ServerModuleName);

	this.allowNotifications = ko.observable(Settings.AllowEmailNotifications);
	this.signature = ko.observable(Settings.Signature);
	this.signatureEnable = ko.observable(Settings.useSignature() ? '1' : '0');
	
	this.signatureEnable.subscribe(function () {
		if (this.signatureEnable() === '1' && !this.signatureFocused())
		{
			this.signatureFocused(true);
		}
	}, this);
	this.signatureFocused = ko.observable(false);
	this.signatureFocused.subscribe(function () {
		if (this.signatureFocused() && this.signatureEnable() !== '1')
		{
			this.signatureEnable('1');
		}
	}, this);
}

_.extendOwn(CHelpdeskSettingsFormView.prototype, CAbstractSettingsFormView.prototype);

CHelpdeskSettingsFormView.prototype.ViewTemplate = '%ModuleName%_HelpdeskSettingsFormView';

CHelpdeskSettingsFormView.prototype.getCurrentValues = function ()
{
	return [
		this.allowNotifications(),
		this.signature(),
		this.signatureEnable()
	];
};

CHelpdeskSettingsFormView.prototype.revertGlobalValues = function ()
{
	this.allowNotifications(Settings.AllowEmailNotifications);
	this.signature(Settings.signature());
	this.signatureEnable(Settings.useSignature() ? '1' : '0');
};

CHelpdeskSettingsFormView.prototype.getParametersForSave = function ()
{
	return {
		'AllowEmailNotifications': this.allowNotifications(),
		'Signature': this.signature(),
		'UseSignature': this.signatureEnable() === '1'
	};
};

CHelpdeskSettingsFormView.prototype.applySavedValues = function (oParameters)
{
	Settings.update(oParameters.AllowEmailNotifications, oParameters.Signature, oParameters.UseSignature);
};

module.exports = new CHelpdeskSettingsFormView();
