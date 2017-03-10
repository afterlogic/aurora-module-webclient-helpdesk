'use strict';

var
	_ = require('underscore'),
	
	CAbstractFileModel = require('%PathToCoreWebclientModule%/js/models/CAbstractFileModel.js')
;

/**
 * @constructor
 * @extends CCommonFileModel
 */
function CHelpdeskAttachmentModel()
{
	CAbstractFileModel.call(this);
}

_.extend(CHelpdeskAttachmentModel.prototype, CAbstractFileModel.prototype);

/**
 * @param {Object} oResult
 */
CHelpdeskAttachmentModel.prototype.fillDataAfterUploadComplete = function (oResult)
{
	this.tempName(oResult.Result.HelpdeskFile.TempName);
	this.mimeType(oResult.Result.HelpdeskFile.MimeType);
	this.hash(oResult.Result.HelpdeskFile.Hash);
};

module.exports = CHelpdeskAttachmentModel;