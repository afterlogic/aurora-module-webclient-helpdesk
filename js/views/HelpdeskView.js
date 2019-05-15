'use strict';

var
	_ = require('underscore'),
	$ = require('jquery'),
	ko = require('knockout'),
	
	FilesUtils = require('%PathToCoreWebclientModule%/js/utils/Files.js'),
	TextUtils = require('%PathToCoreWebclientModule%/js/utils/Text.js'),
	Types = require('%PathToCoreWebclientModule%/js/utils/Types.js'),
	Utils = require('%PathToCoreWebclientModule%/js/utils/Common.js'),
	
	Api = require('%PathToCoreWebclientModule%/js/Api.js'),
	App = require('%PathToCoreWebclientModule%/js/App.js'),
	Browser = require('%PathToCoreWebclientModule%/js/Browser.js'),
	CJua = require('%PathToCoreWebclientModule%/js/CJua.js'),
	CSelector = require('%PathToCoreWebclientModule%/js/CSelector.js'),
	ModulesManager = require('%PathToCoreWebclientModule%/js/ModulesManager.js'),
	Routing = require('%PathToCoreWebclientModule%/js/Routing.js'),
	Screens = require('%PathToCoreWebclientModule%/js/Screens.js'),
	Storage = require('%PathToCoreWebclientModule%/js/Storage.js'),
	UserSettings = require('%PathToCoreWebclientModule%/js/Settings.js'),
	WindowOpener = require('%PathToCoreWebclientModule%/js/WindowOpener.js'),
	Pulse = require('%PathToCoreWebclientModule%/js/Pulse.js'),
	
	CAbstractScreenView = require('%PathToCoreWebclientModule%/js/views/CAbstractScreenView.js'),
	CPageSwitcherView = require('%PathToCoreWebclientModule%/js/views/CPageSwitcherView.js'),
	
	Popups = require('%PathToCoreWebclientModule%/js/Popups.js'),
	AlertPopup = require('%PathToCoreWebclientModule%/js/popups/AlertPopup.js'),
	ConfirmPopup = require('%PathToCoreWebclientModule%/js/popups/ConfirmPopup.js'),
	
	Ajax = require('modules/%ModuleName%/js/Ajax.js'),
	Settings = require('modules/%ModuleName%/js/Settings.js'),
	
	CHelpdeskAttachmentModel = require('modules/%ModuleName%/js/models/CHelpdeskAttachmentModel.js'),
	CPostModel = require('modules/%ModuleName%/js/models/CPostModel.js'),
	CThreadListModel = require('modules/%ModuleName%/js/models/CThreadListModel.js'),
	
	HeaderItemView = require('modules/%ModuleName%/js/views/HeaderItemView.js'),
	
	bExtApp = false
;

/**
 * @constructor
 */
function CHelpdeskView()
{
	CAbstractScreenView.call(this, '%ModuleName%');
	
	this.browserTitle = ko.observable(TextUtils.i18n('%MODULENAME%/HEADING_BROWSER_TAB'));
	
	this.bExtApp = bExtApp;
	this.bAgent = App.isUserNormalOrTenant();
	this.bNewTab = App.isNewTab();

	var
		self = this,
		fChangeStateHelper = function(state) {
			return function () {
				self.executeChangeState(state);
				self.isQuickReplyHidden(!self.bAgent);

				if (state === Enums.HelpdeskThreadStates.Resolved)
				{
					self.selectedItem(null);
					Routing.setHash([Settings.HashModuleName, '']);
				}
			};
		}
	;

	this.bRtl = UserSettings.IsRTL;

	this.iAutoCheckTimer = 0;

	this.signature = Settings.signature;
	this.signatureEnable = Settings.useSignature;
	this.isSignatureVisible = ko.computed(function () {
		return this.signature() !== '' && this.signatureEnable() === '1';
	}, this);

	this.loadingList = ko.observable(true);
	this.loadingViewPane = ko.observable(false);
	this.loadingMoreMessages = ko.observable(false);

	this.threads = ko.observableArray([]);
	this.posts = ko.observableArray([]);

	this.iPingInterval = -1;
	this.iPingStartTimer = -1;
	this.selectedItem = ko.observable(null);
	this.previousSelectedItem = ko.observable(null);
	this.postForDelete = ko.observable(null);
	this.state = ko.observable(0);
	this.ownerDom = ko.observable(null);
	ko.computed(function () {
		this.selectedItem();
		if (this.ownerDom())
		{
			ModulesManager.run('ContactsWebclient', 'applyContactsCards', [[this.ownerDom()]]);
		}
	}, this).extend({ rateLimit: 50 });
	this.selectedItem.subscribe(function (oItem) {
		this.state(oItem ? oItem.state() : 0);
		this.subject(this.selectedItem() ? (this.bExtApp ? this.selectedItem().sSubject : this.selectedItem().sFromFull) : '');
		this.internalNote(false);

		clearInterval(this.iPingInterval);
		clearTimeout(this.iPingStartTimer);
		this.watchers([]);
		if (this.selectedItem())
		{
			this.iPingStartTimer = setTimeout(_.bind(function () {
				this.executeThreadPing(this.selectedItem().Id);

				clearInterval(this.iPingInterval);
				this.iPingInterval = setInterval(_.bind(function () {
					this.executeThreadPing(this.selectedItem().Id);
				}, this), 180000);
			}, this), 5000);
		}
	}, this);

	this.listFilter = ko.observable(this.bAgent ? Enums.HelpdeskFilters.Open : Enums.HelpdeskFilters.All);
	this.listFilter.subscribe(function () {
		this.requestThreadsList();
	}, this);
	this.prevListFilter = ko.observable('');

	this.hasMorePosts = ko.computed(function () {
		var oItem = this.selectedItem();
		return oItem && oItem.postsCount() > this.posts().length;
	}, this).extend({ throttle: 1 });

	//list selector
	this.selector = new CSelector(
		this.threads,
		_.bind(this.onItemSelect, this),
		_.bind(this.onItemDelete, this),
		null, null, null, false, false, false, true
	);

	this.checkStarted = ko.observable(false);

	this.checkAll = this.selector.koCheckAll();
	this.checkAllIncomplite = this.selector.koCheckAllIncomplete();

	this.oPageSwitcher = new CPageSwitcherView(0, Settings.ThreadsPerPage);

	this.oPageSwitcher.currentPage.subscribe(function () {
		this.requestThreadsList();
	}, this);

	//search
	this.isSearchFocused = ko.observable(false);
	this.search = ko.observable('');

	this.searchText = ko.computed(function () {
		return TextUtils.i18n('%MODULENAME%/INFO_SEARCH_RESULT', {
			'SEARCH': this.search()
		});
	}, this);

	//commands
	this.deleteCommand = Utils.createCommand(this, this.executeDelete, this.isEnableListActions);

	this.openNewWindowCommand = Utils.createCommand(this, this.executeOpenNewWindow, this.isEnableListActions);

	this.checkCommand = Utils.createCommand(this, function () {
		this.requestThreadsList();
		this.requestPosts();
		this.startAutoCheckState();
	});

	this.closeCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Resolved), this.isEnableListActions);
	this.waitCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Waiting), this.isEnableListActions);
	this.pendingCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Pending), this.isEnableListActions);
	this.deferCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Deferred), this.isEnableListActions);
	this.answerCommand = Utils.createCommand(this, fChangeStateHelper(Enums.HelpdeskThreadStates.Answered), this.isEnableListActions);

	this.postCommand = Utils.createCommand(this, this.executePostCreate, function () {
		return !!this.selectedItem() &&
			!this.isQuickReplyPaneEmpty() &&
			this.allAttachmentsUploaded();
	});

	this.visibleNewThread = ko.observable(false);
	this.newThreadId = ko.observable(0);
	this.newThreadText = ko.observable('');
	this.newThreadCreating = ko.observable(false);
	this.domNewThreadTextarea = ko.observable(null);
	this.newThreadTextFocus = ko.observable(null);
	this.createThreadCommand = Utils.createCommand(this, this.executeThreadCreate, function () {
		return this.visibleNewThread() && this.newThreadText().length > 0 && !this.newThreadCreating();
	});
	this.createThreadButtonText = ko.computed(function () {
		return this.newThreadCreating() ?
			TextUtils.i18n('%MODULENAME%/ACTION_CREATE_IN_PROGRESS') :
			TextUtils.i18n('%MODULENAME%/ACTION_CREATE');
	}, this);

	this.commandGetOlderPosts = function () {
		var
			aList = this.posts(),
			iPostId  = aList[0] ? aList[0].Id : 0
		;

		this.requestPosts(null, iPostId);
	};

	this.externalContentUrl = ko.observable('');

	if (Settings.ClientDetailsUrl)
	{
		if (this.bAgent)
		{
			this.externalContentUrl = ko.computed(function () {
				var
					oSelected = this.selectedItem(),
					sEmail = oSelected ? oSelected.Email() : ''
				;
				return sEmail ? Settings.ClientDetailsUrl.replace(/\[EMAIL\]/g, sEmail) : '';
			}, this);
		}
		else if (Settings.UserEmail)
		{
			this.externalContentUrl = ko.computed(function () {
				return Settings.ClientDetailsUrl.replace(/\[EMAIL\]/g, Settings.UserEmail);
			}, this);
		}
	}

	// view pane
	this.clientDetailsVisible = ko.observable(Storage.hasData('HelpdeskUserDetails') ? Storage.getData('HelpdeskUserDetails') : true);

	this.clientDetailsVisible.subscribe(function (value) {
		Storage.setData('HelpdeskUserDetails', value);
	}, this);

	this.subject = ko.observable('');
	this.watchers = ko.observableArray([]);

	this.uploadedFiles = ko.observableArray([]);
	this.allAttachmentsUploaded = ko.computed(function () {
		var aNotUploadedFiles = _.filter(this.uploadedFiles(), function (oFile) {
			return !oFile.uploaded();
		});

		return aNotUploadedFiles.length === 0;
	}, this);
	this.uploaderButton = ko.observable(null);
	this.uploaderButtonCompose = ko.observable(null);
	this.uploaderArea = ko.observable(null);
	this.bDragActive = ko.observable(false);//.extend({'throttle': 1});

	this.internalNote = ko.observable(false);

	this.ccbccVisible = ko.observable(false);
	this.ccAddrDom = ko.observable();
	this.ccAddrDom.subscribe(function () {
		this.initInputosaurus(this.ccAddrDom, this.ccAddr, this.lockCcAddr, 'cc');
	}, this);
	this.lockCcAddr = ko.observable(false);
	this.ccAddr = ko.observable('').extend({'reversible': true});
	this.ccAddr.subscribe(function () {
		if (!this.lockCcAddr())
		{
			$(this.ccAddrDom()).val(this.ccAddr());
			$(this.ccAddrDom()).inputosaurus('refresh');
		}
	}, this);
	this.bccAddrDom = ko.observable();
	this.bccAddrDom.subscribe(function () {
		this.initInputosaurus(this.bccAddrDom, this.bccAddr, this.lockBccAddr, 'bcc');
	}, this);
	this.lockBccAddr = ko.observable(false);
	this.bccAddr = ko.observable('').extend({'reversible': true});
	this.bccAddr.subscribe(function () {
		if (!this.lockBccAddr())
		{
			$(this.bccAddrDom()).val(this.bccAddr());
			$(this.bccAddrDom()).inputosaurus('refresh');
		}
	}, this);

	this.preventFalseClick = ko.observable(false).extend({'autoResetToFalse': 500});

	this.isQuickReplyHidden = ko.observable(!this.bAgent);
	this.domQuickReply = ko.observable(null);
	this.domQuickReplyTextarea = ko.observable(null);
	this.replySendingStarted = ko.observable(false);
	this.replyPaneVisible = ko.observable(true);
	this.replyText = ko.observable('');
	this.replyTextFocus = ko.observable(false);
	this.isQuickReplyActive = ko.observable(false);
	this.replyTextFocus.subscribe(function (bFocus) {
		if (bFocus)
		{
			this.isQuickReplyActive(true);
			this.setSignature(this.replyText, this.domQuickReplyTextarea());
		}
	}, this);
	this.isQuickReplyActive.subscribe(function () {
		if (this.isQuickReplyActive())
		{
			this.replyTextFocus(true);
		}
	}, this);
	this.isQuickReplyPaneEmpty = ko.computed(function () {
		return ($.trim(this.replyText()) === this.signature() || this.replyText() === '');
	}, this);

	this.isNewThreadPaneEmpty = ko.computed(function () {
		return ($.trim(this.newThreadText()) === this.signature() || this.newThreadText() === '');
	}, this);

	// view pane //

	this.isSearch = ko.computed(function () {
		return '' !== this.search();
	}, this);

	this.isEmptyList = ko.computed(function () {
		return 0 === this.threads().length;
	}, this);

	if (this.bAgent)
	{
		this.dynamicEmptyListInfo = ko.computed(function () {
			return this.isEmptyList() && this.isSearch() ?
				TextUtils.i18n('%MODULENAME%/INFO_SEARCH_EMPTY') : TextUtils.i18n('%MODULENAME%/INFO_EMPTY_OPEN_THREAD_LIST_AGENT');
		}, this);
	}
	else
	{
		this.dynamicEmptyListInfo = ko.computed(function () {
			return this.isEmptyList() && this.isSearch() ?
				TextUtils.i18n('%MODULENAME%/INFO_SEARCH_EMPTY') : TextUtils.i18n('%MODULENAME%/INFO_EMPTY_THREAD_LIST');
		}, this);
	}

	this.simplePreviewPane = ko.computed(function () { //TODO on first load oItem is null therefore loaded the wrong template - %ModuleName%_ViewThread
		var oItem = this.selectedItem();
		return oItem ? oItem.ItsMe : !this.bAgent;
	}, this);

	this.allowInternalNote = ko.computed(function () {
		return !this.simplePreviewPane();
	}, this);

	this.scrollToTopTrigger = ko.observable(false);
	this.scrollToBottomTrigger = ko.observable(false);

	this.allowDownloadAttachmentsLink = false;

	this.newThreadButtonWidth = ko.observable(0);

	this.focusedField = ko.observable();

	this.requestFromLogin();
	
	App.broadcastEvent('%ModuleName%::ConstructView::after', {'Name': this.ViewConstructorName, 'View': this});
}

_.extendOwn(CHelpdeskView.prototype, CAbstractScreenView.prototype);

CHelpdeskView.prototype.ViewTemplate = '%ModuleName%_HelpdeskView';
CHelpdeskView.prototype.ViewConstructorName = 'CHelpdeskView';

/**
 * @param {Object} koAddrDom
 * @param {Object} koAddr
 * @param {Object} koLockAddr
 * @param {String} sFocusedField
 */
CHelpdeskView.prototype.initInputosaurus = function (koAddrDom, koAddr, koLockAddr, sFocusedField)
{
	if (koAddrDom() && $(koAddrDom()).length > 0)
	{
		$(koAddrDom()).inputosaurus({
			width: 'auto',
			parseOnBlur: true,
			autoCompleteSource: ModulesManager.run('ContactsWebclient', 'getSuggestionsAutocompleteCallback', ['all']) || function () {},
			autoCompleteDeleteItem: ModulesManager.run('ContactsWebclient', 'getSuggestionsAutocompleteDeleteHandler') || function () {},
			autoCompleteAppendTo: $(koAddrDom()).closest('td'),
			change: _.bind(function (ev) {
				koLockAddr(true);
				this.setRecipient(koAddr, ev.target.value);
				koLockAddr(false);
			}, this),
			copy: _.bind(function (sVal) {
				this.inputosaurusBuffer = sVal;
			}, this),
			paste: _.bind(function () {
				var sInputosaurusBuffer = this.inputosaurusBuffer || '';
				this.inputosaurusBuffer = '';
				return sInputosaurusBuffer;
			}, this),
			focus: _.bind(this.focusedField, this, sFocusedField),
			mobileDevice: Browser.mobileDevice
		});
	}
};

/**
 * @param {Object} koRecipient
 * @param {string} sRecipient
 */
CHelpdeskView.prototype.setRecipient = function (koRecipient, sRecipient)
{
	if (koRecipient() === sRecipient)
	{
		koRecipient.valueHasMutated();
	}
	else
	{
		koRecipient(sRecipient);
	}
};

CHelpdeskView.prototype.requestFromLogin = function ()
{
	if (this.bExtApp && Storage.getData('helpdeskQuestion'))
	{
		this.newThreadText(Storage.getData('helpdeskQuestion'));
		Storage.removeData('helpdeskQuestion');
		this.executeThreadCreate();
	}
};

CHelpdeskView.prototype.cleanAll = function ()
{
	this.replyText('');
	this.replyTextFocus(false);
	this.newThreadText('');
	this.uploadedFiles([]);
	this.posts([]);
	this.internalNote(false);
	this.isQuickReplyActive(false);
	this.ccbccVisible(false);
	this.ccAddr('');
	this.bccAddr('');
};

CHelpdeskView.prototype.updateOpenerWindow = function ()
{
//	if (App.isNewTab() && window.opener && window.opener.App)
//	{
//		window.opener.App.updateHelpdesk();
//	}
};

/**
 * @param {Object} oPost
 */
CHelpdeskView.prototype.deletePost = function (oPost)
{
	if (oPost && oPost.itsMe())
	{
		Popups.showPopup(ConfirmPopup, [TextUtils.i18n('%MODULENAME%/CONFIRM_DELETE_THIS_POST'),
			_.bind(function (bDelete) {
				if (bDelete)
				{
					this.postForDelete(oPost);
					Ajax.send('DeletePost', {
						'PostId': oPost.Id,
						'ThreadId': oPost.IdThread
					}, this.onDeletePostResponse, this);
				}
			}, this)
		]);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onDeletePostResponse = function (oResponse, oRequest)
{
	if (oResponse.Result === false)
	{
		Api.showErrorByCode(oResponse, TextUtils.i18n('%MODULENAME%/ERROR_COULDNT_DELETE_POST'));
	}
	else
	{
		this.posts.remove(this.postForDelete());
		Screens.showReport(TextUtils.i18n('%MODULENAME%/REPORT_POST_HAS_BEEN_DELETED'));
	}

	this.requestPosts();
	this.updateOpenerWindow();
};

CHelpdeskView.prototype.iHaveMoreToSay = function ()
{
	this.isQuickReplyHidden(false);
	_.delay(_.bind(function () {
		this.replyTextFocus(true);
	}, this), 300);
};

CHelpdeskView.prototype.scrollPostsToBottom = function ()
{
	this.scrollToBottomTrigger(!this.scrollToBottomTrigger());
};

CHelpdeskView.prototype.scrollPostsToTop = function ()
{
	this.scrollToTopTrigger(!this.scrollToTopTrigger());
};

CHelpdeskView.prototype.showClientDetails = function ()
{
	this.clientDetailsVisible(true);
};

CHelpdeskView.prototype.hideClientDetails = function ()
{
	this.clientDetailsVisible(false);
};

CHelpdeskView.prototype.startAutoCheckState = function ()
{
	if (UserSettings.AutoRefreshIntervalMinutes > 0)
	{
		clearTimeout(this.iAutoCheckTimer);
		this.iAutoCheckTimer = setTimeout(_.bind(function () {
			this.checkCommand();
		}, this), UserSettings.AutoRefreshIntervalMinutes * 60 * 1000);
	}
};

CHelpdeskView.prototype.onBind = function ()
{
	this.selector.initOnApplyBindings(
		'.items_sub_list .item',
		'.items_sub_list .selected.item',
		'.items_sub_list .item .custom_checkbox',
		$('.items_list', this.$viewDom),
		$('.threads_scroll.scroll-inner', this.$viewDom)
	);

	this.initUploader();

	$(this.domQuickReply()).on('click', _.bind(function (oEvent) {
		this.preventFalseClick(true);
	}, this));

	$(document.body).on('click', _.bind(function (oEvent) {
		if (this.shown() && this.isQuickReplyPaneEmpty() && !this.preventFalseClick())
		{
			this.replyText('');
			this.isQuickReplyActive(false);
		}
	}, this));

//	if (App.registerHelpdeskUpdateFunction)
//	{
//		App.registerHelpdeskUpdateFunction(_.bind(this.checkCommand, this));
//	}

	this.startAutoCheckState();
	
	if (UserSettings.AutoRefreshIntervalMinutes !== 1)
	{
		Pulse.registerEveryMinuteFunction(_.bind(function () {
			if (this.shown())
			{
				$('.moment-date-trigger-fast').each(function () {
					var oItem = ko.dataFor(this);
					if (oItem && $.isFunction(oItem.updateMomentDate))
					{
						oItem.updateMomentDate();
					}
				});
			}
		}, this));
	}
};

CHelpdeskView.prototype.onShow = function ()
{
	this.newThreadButtonWidth.notifySubscribers();
	this.selector.useKeyboardKeys(true);

	this.oPageSwitcher.show();
	this.oPageSwitcher.perPage(Settings.ThreadsPerPage);
	this.oPageSwitcher.currentPage(1);

	this.requestThreadsList();
};

CHelpdeskView.prototype.onHide = function ()
{
	this.selector.useKeyboardKeys(false);
	this.oPageSwitcher.hide();
};

CHelpdeskView.prototype.requestThreadsList = function ()
{
	if (!this.newThreadCreating())
	{
		this.loadingList(true);
		this.checkStarted(true);
		
		Ajax.send('GetThreads', {
			'Offset': (this.oPageSwitcher.currentPage() - 1) * Settings.ThreadsPerPage,
			'Limit': Settings.ThreadsPerPage,
			'Filter': this.listFilter(),
			'Search': this.search()
		}, this.onGetThreadsResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onGetThreadsResponse = function (oResponse, oRequest)
{
	var
		iIndex = 0,
		iLen = 0,
		oSelectedItem = this.selectedItem(),
		sSelectedId = oSelectedItem ? Types.pString(oSelectedItem.Id) : '',
		aList = [],
		oObject = null,
		oThreadForSelect = null,
		aThreadList = (oResponse.Result && _.isArray(oResponse.Result.List)) ? oResponse.Result.List : []
	;

	this.checkStarted(false);

	if (oResponse.Result === false)
	{
		Api.showErrorByCode(oResponse);
	}
	else
	{
		for (iLen = aThreadList.length; iIndex < iLen; iIndex++)
		{
			if (aThreadList[iIndex] && 'Object/CThread' === aThreadList[iIndex]['@Object'])
			{
				oObject = new CThreadListModel();
				oObject.parse(aThreadList[iIndex]);
				oObject.OwnerIsMe = Types.pString(oObject.IdOwner);

				if (sSelectedId === Types.pString(oObject.Id))
				{
					oSelectedItem.postsCount(oObject.postsCount());

					oObject.selected(true);
					this.selector.itemSelected(oObject);
				}

				aList.push(oObject);
			}
		}

		this.loadingList(false);

		if (this.newThreadId())
		{
			var iThreadId = this.newThreadId();

			this.onItemSelect( _.find(this.threads().concat(aList), function(oItem){ return oItem.ItsMe && oItem.Id === iThreadId; }));
			this.newThreadId(null);
		}

		this.threads(aList);
		this.setUnseenCount();

		this.oPageSwitcher.setCount(Types.pInt(oResponse.Result.ItemsCount));

		if (Settings.SelectedThreadId)
		{
			oThreadForSelect = _.find(aList, function (oThreadItem) {
				return oThreadItem.Id === Settings.SelectedThreadId;
			}, this);

			if (oThreadForSelect)
			{
				this.onItemSelect(oThreadForSelect);
			}
			else if (aList.length)
			{
				this.requestThreadByIdOrHash(Settings.SelectedThreadId);
			}
		}

		switch (Settings.AfterThreadsReceivingAction)
		{
			case 'add':
				this.iHaveMoreToSay();
				break;
			case 'close':
				this.closeCommand();
				break;
		}
	}
};

/**
 * @param {number} iThreadId
 * @param {string} sThreadHash
 */
CHelpdeskView.prototype.requestThreadByIdOrHash = function (iThreadId, sThreadHash)
{
	Ajax.send('GetThread', {
		'ThreadId': iThreadId ? iThreadId : 0,
		'ThreadHash': sThreadHash ? sThreadHash : ''
	}, this.onGetThreadResponse, this);
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onGetThreadResponse = function (oResponse, oRequest)
{
	var oItem = new CThreadListModel();

	if (oResponse.Result)
	{
		oItem.parse(oResponse.Result);
		oItem.OwnerIsMe = Types.pString(oItem.IdOwner);
		this.onItemSelect(oItem);
	}
};

/**
 * @param {Object=} oItem = undefined
 * @param {number=} iStartFromId = 0
 */
CHelpdeskView.prototype.requestPosts = function (oItem, iStartFromId)
{
	var
		oSelectedThread = this.selectedItem(),
		iId = oItem ? oItem.Id : (oSelectedThread ? oSelectedThread.Id : 0),
		iFromId = iStartFromId ? iStartFromId : 0,
		oParameters = {}
	;

	if (iId)
	{
		oParameters = {
			'ThreadId': iId,
			'StartFromId': iFromId,
			'Limit': 5
		};

		if (iFromId)
		{
			this.loadingMoreMessages(true);
		}

		Ajax.send('GetPosts', oParameters, this.onGetPostsResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onGetPostsResponse = function (oResponse, oRequest)
{
	var
		self = this,
		iIndex = 0,
		iLen = 0,
		aList = [],
		aPosts = [],
		oObject = null,
		oResult = oResponse.Result,
		aPostList = (oResult && _.isArray(oResult.List)) ? oResult.List : []
	;

	if (oResult === false)
	{
		Api.showErrorByCode(oResponse);
	}
	else
	{
		if (this.selectedItem() && oResult.ThreadId === this.selectedItem().Id)
		{
			this.selectedItem().postsCount(Types.pInt(oResult.ItemsCount));

			for (iLen = aPostList.length; iIndex < iLen; iIndex++)
			{
				if (aPostList[iIndex] && 'Object/CPost' === aPostList[iIndex]['@Object'])
				{
					oObject = new CPostModel();
					oObject.parse(aPostList[iIndex]);

					aList.push(oObject);
				}
			}

			aPosts = this.posts();

			if (oResult.StartFromId)
			{
				_.each(aList, function (oItem, iIdx) {
					this.posts.unshift(oItem);
				}, this);

				this.loadingMoreMessages(false);
			}
			else
			{
				if (aPosts.length === 0 || aPosts[aPosts.length - 1].Id !== aList[0].Id) //check match last items
				{
					if (aPosts.length !== 0)
					{
						_.each(aList.reverse(), function (oItem, iIdx) {
							if (!_.find(aPosts, function(oPost){ return oPost.Id === oItem.Id; })) //remove duplicated posts from aList
							{
								this.posts.push(oItem); //push unique/new items to list
							}
						}, this);
					}
					else
					{
						this.posts(aList.reverse()); //first/initial occurrence
					}

					_.delay(function () {
						self.scrollPostsToBottom();
					}, 100);
				}
			}

			if (this.selectedItem().unseen())
			{
				this.executeThreadSeen(this.selectedItem().Id);
			}
		}
	}
};

/**
 * @param {Array} aParams
 */
CHelpdeskView.prototype.onRoute = function (aParams)
{
	var
		sThreadHash = aParams[0],
		oItem = _.find(this.threads(), function (oThread) {
			return oThread.ThreadHash === sThreadHash;
		})
	;

	if (oItem)
	{
		this.onItemSelect(oItem);
	}
	else if (this.threads().length === 0 && this.loadingList() && this.threadSubscription === undefined && !App.isNewTab())
	{
		this.threadSubscription = this.threads.subscribe(function () {
			this.onRoute(aParams);
			this.threadSubscription.dispose();
			this.threadSubscription = undefined;
		}, this);
	}
	else if (sThreadHash)
	{
		this.requestThreadByIdOrHash(null, sThreadHash);
	}
	else
	{
		this.selectedItem(null);
		this.selector.itemSelected(null);
	}
};

/**
 * 
 * @param {Object} oItem
 */
CHelpdeskView.prototype.onItemSelect = function (oItem)
{
	this.previousSelectedItem(this.selectedItem());
	if (!this.selectedItem() || oItem && (this.selectedItem().ThreadHash !== oItem.ThreadHash || this.selectedItem().Id !== oItem.Id))
	{
		if (!this.replySendingStarted() && (!this.isQuickReplyPaneEmpty() || !this.isNewThreadPaneEmpty()))
		{
			Popups.showPopup(ConfirmPopup, [TextUtils.i18n('%MODULENAME%/CONFIRM_CANCEL_REPLY'),
				_.bind(function (bResult) {
					if (bResult)
					{
						this.selectItem(oItem);
					}
					else
					{
						this.replyTextFocus(true);
						this.isQuickReplyHidden(false);
						this.selector.itemSelected(this.previousSelectedItem());
					}
				}, this)]
			);
		}
		else
		{
			this.selectItem(oItem);
		}
	}
};

CHelpdeskView.prototype.onItemDelete = function ()
{
	this.executeDelete();
};

/**
 * @param {object} oItem
 */
CHelpdeskView.prototype.selectItem = function (oItem)
{
	this.visibleNewThread(false);
	this.selector.listCheckedAndSelected(false);
	this.cleanAll();

	if (oItem)
	{
		this.selector.itemSelected(oItem);
		this.selectedItem(oItem);

		this.isQuickReplyHidden(oItem.ItsMe || !this.bAgent);
		this.requestPosts(oItem);

		if (!App.isNewTab())
		{
			Routing.setHash([Settings.HashModuleName, oItem.ThreadHash]); //TODO this code causes a bug with switching to helpdesk when you on another screen
		}
		oItem.postsCount(0);
		this.posts([]);
	}
};

CHelpdeskView.prototype.openNewThread = function ()
{
	this.selector.itemSelected(null);
	this.selectedItem(null);
	this.visibleNewThread(true);
	Routing.setHash([Settings.HashModuleName, '']);
	this.newThreadTextFocus(true);
	this.setSignature(this.newThreadText, this.domNewThreadTextarea());
};

CHelpdeskView.prototype.cancelNewThread = function ()
{
	this.onItemSelect(this.previousSelectedItem());
};

CHelpdeskView.prototype.isEnableListActions = function ()
{
	return !!this.selectedItem();
};

CHelpdeskView.prototype.executeDelete = function ()
{
	var
		self = this,
		oSelectedItem = this.selectedItem()
	;

	if (oSelectedItem)
	{
		_.each(this.threads(), function (oItem) {
			if (oItem === oSelectedItem)
			{
				oItem.deleted(true);
			}
		});

		_.delay(function () {
			self.threads.remove(function (oItem) {
				return oItem.deleted();
			});
		}, 500);

		this.selectedItem(null);

		Ajax.send('DeleteThread', {
			'ThreadId': oSelectedItem.Id
		}, this.updateDisplayingData, this);
		
		Routing.setHash([Settings.HashModuleName, '']);
	}
};

CHelpdeskView.prototype.updateDisplayingData = function ()
{
	this.requestThreadsList();
	this.updateOpenerWindow();
};

CHelpdeskView.prototype.executeOpenNewWindow = function ()
{
	var sUrl = Routing.buildHashFromArray([Settings.HashModuleName, this.selectedItem().ThreadHash]);

	WindowOpener.openTab(sUrl);
};

/**
 * @param {number} iState
 */
CHelpdeskView.prototype.executeChangeState = function (iState)
{
	var oSelectedItem = this.selectedItem();

	if (iState === undefined)
	{
		return;
	}

	//TODO can't delete thread with id = 0
	if (oSelectedItem)
	{
		oSelectedItem.state(iState);

		Ajax.send('ChangeThreadState', {
			'ThreadId': oSelectedItem.Id,
			'Type': oSelectedItem.state()
		}, this.updateDisplayingData, this);
	}
};

/**
 * @param {number} iId
 */
CHelpdeskView.prototype.executeThreadPing = function (iId)
{
	if (iId !== undefined)
	{
		Ajax.send('PingThread', { 'ThreadId': iId }, this.onPingThreadResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onPingThreadResponse = function (oResponse, oRequest)
{
	this.watchers(
		_.map(oResponse.Result, function (aWatcher) {
			var
				sName = (aWatcher.length > 0) ? aWatcher[0].replace(/"/g, "") : '',
				sEmail = (aWatcher.length > 0) ? aWatcher[1] : '',
				oRes = {
					name: sName,
					email: sEmail,
					text: sEmail,
					initial: sEmail.substr(0,2),
					icon: ''
				}
			;

			if (sEmail.length > 0 && sName.length > 0)
			{
				oRes.text = '"' + sName + '" <' + sEmail + '>';
				if (/\s/g.test(sName)) //check for whitespace
				{
					oRes.initial = this.getInitials(sName);
				}
				else
				{
					oRes.initial = sName.substr(0,2);
				}
			}
			else if (sEmail.length > 0)
			{
				oRes.text = sEmail;
				oRes.initial = sEmail.substr(0,2);
			}
			else if (sName.length > 0)
			{
				oRes.text = sName;
				oRes.initial = this.getInitials(sName);
			}

			return oRes;
		}, this)
	);
};

/**
 * @param {string} sName
 */
CHelpdeskView.prototype.getInitials = function (sName)
{
	return _.reduce(sName.split(' ', 2), function(sMemo, sNamePath){ return sMemo + sNamePath.substr(0,1); }, ''); //get first letter from each of the two words
};

/**
 * @param {number} iId
 */
CHelpdeskView.prototype.executeThreadSeen = function (iId)
{
	if (iId !== undefined)
	{
		Ajax.send('SetThreadSeen', { 'ThreadId': iId }, this.onSetThreadSeenResponse, this);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onSetThreadSeenResponse = function (oResponse, oRequest)
{
	if (oResponse.Result && this.selectedItem())
	{
		this.selectedItem().unseen(false);
		this.setUnseenCount();
	}

	this.updateOpenerWindow();
};

CHelpdeskView.prototype.executeThreadCreate = function ()
{
	var
		sNewThreadSubject = $.trim(this.newThreadText().replace(/[\n\r]/, ' ')),
		iFirstSpacePos = sNewThreadSubject.indexOf(' ', 40)
	;

	if (iFirstSpacePos >= 0)
	{
		sNewThreadSubject = sNewThreadSubject.substring(0, iFirstSpacePos);
	}

	this.newThreadCreating(true);

	this.createPost(0, sNewThreadSubject, this.newThreadText(), this.onCreateThreadResponse);
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onCreateThreadResponse = function (oResponse, oRequest)
{
	//TODO change created post
	this.newThreadCreating(false);

	if (oResponse.Result)
	{
		Screens.showReport(TextUtils.i18n('%MODULENAME%/REPORT_THREAD_SUCCESSFULLY_CREATED'));

		if (oResponse.Result.ThreadIsNew)
		{
			this.newThreadId(oResponse.Result.ThreadId);
		}

		this.cleanAll();
		this.visibleNewThread(false);
	}

	this.updateDisplayingData();
};

CHelpdeskView.prototype.executePostCreate = function ()
{
	if (this.selectedItem())
	{
		this.replySendingStarted(true);
		this.createPost(this.selectedItem().Id, '', this.replyText(), this.onCreatePostResponse);
	}
};

/**
 * @param {Object} oResponse
 * @param {Object} oRequest
 */
CHelpdeskView.prototype.onCreatePostResponse = function (oResponse, oRequest)
{
	this.replySendingStarted(false);

	if (oResponse.Result)
	{
		Screens.showReport(TextUtils.i18n('%MODULENAME%/REPORT_POST_SUCCESSFULLY_ADDED'));
		this.cleanAll();
		this.requestPosts();
	}

	this.updateDisplayingData();
};

/**
 * @param {number} iThreadId
 * @param {string} sSubject
 * @param {string} sText
 * @param {Function} fResponseHandler
 */
CHelpdeskView.prototype.createPost = function (iThreadId, sSubject, sText, fResponseHandler)
{
	var
		aAttachments = {},
		oParameters = {}
	;

	_.each(this.uploadedFiles(), function (oItem) {
		aAttachments[oItem.tempName()] = oItem.hash();
	});

	oParameters = {
		'ThreadId': iThreadId,
		'IsInternal': this.internalNote(),
		'Subject': sSubject,
		'Text': sText,
		'Cc': this.ccAddr(),
		'Bcc': this.bccAddr(),
		'Attachments': aAttachments
	};

	Ajax.send('CreatePost', oParameters, fResponseHandler, this);
};

CHelpdeskView.prototype.onShowThreadsByOwner = function ()
{
	this.search('owner:' + this.selectedItem().aOwner[0]);
	this.listFilter(Enums.HelpdeskFilters.All);
	this.requestThreadsList();
};

CHelpdeskView.prototype.onSearch = function ()
{
	this.requestThreadsList();
};

CHelpdeskView.prototype.onClearSearch = function ()
{
	this.search('');
	this.requestThreadsList();
};

/**
 * Initializes file uploader.
 */
CHelpdeskView.prototype.initUploader = function ()
{
	this.oJua = this.createJuaObject(this.uploaderButton());
	this.oJuaCompose = this.createJuaObject(this.uploaderButtonCompose());
};

/**
 * @param {Object} oButton
 */
CHelpdeskView.prototype.createJuaObject = function (oButton)
{
	if (oButton)
	{
		var oJua = new CJua({
			'action': '?/Api/',
			'name': 'jua-uploader',
			'queueSize': 2,
			'clickElement': oButton,
			'hiddenElementsPosition': UserSettings.IsRTL ? 'right' : 'left',
			'dragAndDropElement': oButton,
			'disableAjaxUpload': false,
			'disableFolderDragAndDrop': false,
			'disableDragAndDrop': false,
			'hidden': _.extendOwn({
				'Module': Settings.ServerModuleName,
				'Method': 'UploadAttachment'
			}, App.getCommonRequestParameters())
		});

		oJua
			.on('onProgress', _.bind(this.onFileUploadProgress, this))
			.on('onSelect', _.bind(this.onFileUploadSelect, this))
			.on('onStart', _.bind(this.onFileUploadStart, this))
			.on('onComplete', _.bind(this.onFileUploadComplete, this))
			.on('onBodyDragEnter', _.bind(this.bDragActive, this, true))
			.on('onBodyDragLeave', _.bind(this.bDragActive, this, false))
		;

		return oJua;
	}
	else
	{
		return null;
	}
};

/**
 * @param {string} sFileUID
 */
CHelpdeskView.prototype.onFileRemove = function (sFileUID)
{
	var oAttach = this.getUploadedFileByUID(sFileUID);

	if (this.oJua)
	{
		this.oJua.cancel(sFileUID);
	}

	this.uploadedFiles.remove(oAttach);
};

/**
 * @param {string} sFileUID
 */
CHelpdeskView.prototype.getUploadedFileByUID = function (sFileUID)
{
	return _.find(this.uploadedFiles(), function (oAttach) {
		return oAttach.uploadUid() === sFileUID;
	});
};

/**
 * @param {string} sFileUID
 * @param {Object} oFileData
 */
CHelpdeskView.prototype.onFileUploadSelect = function (sFileUID, oFileData)
{
	var
		oAttach,
		sWarningCountLimit = TextUtils.i18n('%MODULENAME%/ERROR_UPLOAD_FILES_COUNT'),
		sButtonCountLimit = TextUtils.i18n('COREWEBCLIENT/ACTION_CLOSE'),
		iAttachCount = this.uploadedFiles().length
	;

	if (iAttachCount >= 5)
	{
		Popups.showPopup(AlertPopup, [sWarningCountLimit, null, '', sButtonCountLimit]);
		return false;
	}

	if (FilesUtils.showErrorIfAttachmentSizeLimit(oFileData.FileName, oFileData.Size))
	{
		return false;
	}

	oAttach = new CHelpdeskAttachmentModel();

	oAttach.onUploadSelect(sFileUID, oFileData);

	this.uploadedFiles.push(oAttach);

	return true;
};

/**
 * @param {string} sFileUID
 * @param {number} iUploadedSize
 * @param {number} iTotalSize
 */
CHelpdeskView.prototype.onFileUploadProgress = function (sFileUID, iUploadedSize, iTotalSize)
{
	var oAttach = this.getUploadedFileByUID(sFileUID);

	if (oAttach)
	{
		oAttach.onUploadProgress(iUploadedSize, iTotalSize);
	}
};

/**
 * @param {string} sFileUID
 */
CHelpdeskView.prototype.onFileUploadStart = function (sFileUID)
{
	var oAttach = this.getUploadedFileByUID(sFileUID);

	if (oAttach)
	{
		oAttach.onUploadStart();
	}
};

/**
 * @param {string} sFileUID
 * @param {boolean} bResult
 * @param {Object} oResult
 */
CHelpdeskView.prototype.onFileUploadComplete = function (sFileUID, bResult, oResult)
{
	var oAttach = this.getUploadedFileByUID(sFileUID);

	if (oAttach)
	{
		oAttach.onUploadComplete(sFileUID, bResult, oResult);
	}
};

CHelpdeskView.prototype.setUnseenCount = function ()
{
	HeaderItemView.unseenCount(_.filter(this.threads(), function (oThreadList) {
		return oThreadList.unseen();
	}, this).length);
};

/**
 * @param {string} sText
 */
CHelpdeskView.prototype.quoteText = function (sText)
{
	var
		sReplyText = this.replyText(),
		fDoingQuote = _.bind(function() {
			this.replyText(sReplyText === '' ? '>' + sText : sReplyText + '\n' + '>' + sText);
			this.replyTextFocus(true);
		}, this)
	;

	if(this.isQuickReplyHidden())
	{
		_.delay(function(){ fDoingQuote(); }, 300);
	}
	else
	{
		fDoingQuote();
	}
	this.isQuickReplyHidden(false);
};

/**
 * @param {object} koText
 * @param {object} domTextarea
 */
CHelpdeskView.prototype.setSignature = function (koText, domTextarea)
{
	if (koText && koText() === '' && this.isSignatureVisible())
	{
		koText("\r\n\r\n" + this.signature());
	}

	if (domTextarea)
	{
		setTimeout(function () {
			domTextarea = domTextarea[0];
			if (domTextarea.setSelectionRange)
			{
				domTextarea.focus();
				domTextarea.setSelectionRange(0, 0);
			}
			else if (domTextarea.createTextRange)
			{
				var range = domTextarea.createTextRange();

				range.moveStart('character', 0);
				range.select();
			}
		}.bind(this), 10);
	}
};

CHelpdeskView.prototype.changeCcbccVisibility = function ()
{
	this.ccbccVisible(true);
	$(this.ccAddrDom()).inputosaurus('focus');
};

module.exports = new CHelpdeskView();
