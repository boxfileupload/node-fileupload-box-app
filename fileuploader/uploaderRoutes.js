var path = require('path');
var formidable = require('formidable');
var fs = require('fs');
var uploadeCtrl = require('../fileuploader/uploaderController')

module.exports = function(appObj){
	appObj.post('/upload', uploadeCtrl.uploadBoxFile);
}