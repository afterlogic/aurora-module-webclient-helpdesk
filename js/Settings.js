'use strict';

var
	ko = require('knockout'),
	_ = require('underscore'),
	
	Types = require('%PathToCoreWebclientModule%/js/utils/Types.js')
;

module.exports = {
	ServerModuleName: 'HelpDesk',
	HashModuleName: 'helpdesk',
	
	ActivatedEmail: '', // todo: showReport(Utils.i18n('%MODULENAME%/ACCOUNT_ACTIVATED'));
	AllowEmailNotifications: false,
	AllowFacebookAuth: false,
	AllowGoogleAuth: false,
	AllowTwitterAuth: false,
	AfterThreadsReceivingAction: 'add', // add, close
	ClientDetailsUrl: '',
	ClientSiteName: '',
	ForgotHash: '',
	IsAgent: false,
	LoginLogoUrl: '',
	SelectedThreadId: 0,
	signature: ko.observable(''),
	SocialEmail: '',
	SocialIsLoggedIn: false,
	ThreadsPerPage: 10,
	UserEmail: '',
	useSignature: ko.observable(false),
	
	/**
	 * Initializes settings from AppData object sections.
	 * 
	 * @param {Object} oAppData Object contained modules settings.
	 */
	init: function (oAppData)
	{
		var oAppDataSection = oAppData[this.ServerModuleName];
		
		if (!_.isEmpty(oAppDataSection))
		{
			this.ActivatedEmail = Types.pString(oAppDataSection.ActivatedEmail, this.ActivatedEmail); // todo: showReport(Utils.i18n('%MODULENAME%/ACCOUNT_ACTIVATED'));
			this.AllowEmailNotifications = Types.pBool(oAppDataSection.AllowEmailNotifications, this.AllowEmailNotifications);
			this.AllowFacebookAuth = Types.pBool(oAppDataSection.AllowFacebookAuth, this.AllowFacebookAuth);
			this.AllowGoogleAuth = Types.pBool(oAppDataSection.AllowGoogleAuth, this.AllowGoogleAuth);
			this.AllowTwitterAuth = Types.pBool(oAppDataSection.AllowTwitterAuth, this.AllowTwitterAuth);
			this.AfterThreadsReceivingAction = Types.pString(oAppDataSection.AfterThreadsReceivingAction, this.AfterThreadsReceivingAction); // add, close
			this.ClientDetailsUrl = Types.pString(oAppDataSection.ClientDetailsUrl, this.ClientDetailsUrl);
			this.ClientSiteName = Types.pString(oAppDataSection.ClientSiteName, this.ClientSiteName);
			this.ForgotHash = Types.pString(oAppDataSection.ForgotHash, this.ForgotHash);
			this.IsAgent = Types.pBool(oAppDataSection.IsAgent, this.IsAgent);
			this.LoginLogoUrl = Types.pString(oAppDataSection.LoginLogoUrl, this.LoginLogoUrl);
			this.SelectedThreadId = Types.pInt(oAppDataSection.SelectedThreadId, this.SelectedThreadId);
			this.signature(Types.pString(oAppDataSection.Signature, this.signature()));
			this.SocialEmail = Types.pString(oAppDataSection.SocialEmail, this.SocialEmail);
			this.SocialIsLoggedIn = Types.pBool(oAppDataSection.SocialIsLoggedIn, this.SocialIsLoggedIn);
			this.ThreadsPerPage = Types.pPositiveInt(oAppDataSection.ThreadsPerPage, this.ThreadsPerPage);
			this.UserEmail = Types.pString(oAppDataSection.UserEmail, this.UserEmail);
			this.useSignature(Types.pBool(oAppDataSection.UseSignature, this.useSignature()));
		}
	},
	
	/**
	 * Updates new settings values after saving on server.
	 * 
	 * @param {string} sAllowEmailNotifications
	 * @param {string} sHelpdeskSignature
	 * @param {string} sHelpdeskSignatureEnable
	 */
	update: function (sAllowEmailNotifications, sHelpdeskSignature, sHelpdeskSignatureEnable)
	{
		this.AllowEmailNotifications = sAllowEmailNotifications === '1';
		this.signature(sHelpdeskSignature);
		this.useSignature(sHelpdeskSignatureEnable === '1');
	}
};
