var path = require('path');
var formidable = require('formidable');
var fs = require('fs');
require('rootpath')();
const box = require("box-node-sdk");
const crypto = require('crypto');
var async = require('async');
let configFile = fs.readFileSync('appconfig.json');
configFile = JSON.parse(configFile);
const CHUNKED_UPLOAD_MINIMUM = 20000000;
var Client = require('node-rest-client').Client;
var client = new Client();



exports.uploadBoxFile = function(req, res) {
    console.log("req.query>>>>>>>>>>>", req.query);
  async.waterfall( 
    [
       function(callback) {
          var form = new formidable.IncomingForm();
          
          form.uploadDir = path.join(__dirname, '..', '/uploads');
		  form.on('file', function(field, file) {
		    fs.rename(file.path, path.join(form.uploadDir, file.name));
		  });
		  form.on('error', function(err) {
		    console.log('An error has occured: \n' + err);
		    return res.status(400).json({
                        apiStatus: "failure",
                        msg: err
                    });
		  });

		  form.on('end', function() {
		    callback(null);
		  });
		  form.parse(req);
  	   },

  	   function(callback) {
  	   	  let session = box.getPreconfiguredInstance(configFile);
  	   	  let client = session.getAppAuthClient("enterprise");
  	   	  const parentFolderId = "0";
		  const directoryName = "uploads";
		  let files = [];

		  fs.readdirSync(directoryName).forEach((file) => {
			  files.push({ fileName: file, content: fs.readFileSync(path.join(__dirname, '..', directoryName, file)) });
		  });

		    client.folders.create(parentFolderId, directoryName)
		    .then((createdFolder) => {
		        console.log(createdFolder);
		        return processFiles(client, files, createdFolder.id);
		    })
		    .catch((err) => {
		        let conflictId = handleFolderConflictError(err);
		        if (conflictId) {
		            console.log(`Found an existing folder: ${conflictId}`);
		            return processFiles(client, files, conflictId);
		        } else {
		        	for (const file of files) {
					    fs.unlink(path.join(__dirname, '..', directoryName, file.fileName));
					}
		            res.status(400).json({
                        apiStatus: "failure",
                        msg: err
                    });
		        }
		    })
		    .then((results) => {
		        for (const file of files) {
				    fs.unlink(path.join(__dirname, '..', directoryName, file.fileName));
				}
                authO(function(error, data) {
                    console.log("data>>>>>>>>>>>>>>>>>>>", data)
                    var fileData = results[0].entries[0];
                    var uploadFileInfo = {"Name":fileData.name,"Size":fileData.size.toString(),"result":"Success","BoxID":fileData.id,"RecordID": req.query.id,"Type":fileData.name.split(".")[1]} 
                    if(data) {
                        console.log("uploadFileInfo>>>>>>>>>>>>", uploadFileInfo)
                        createDataSalesForce(uploadFileInfo, data.access_token, function(error, recordCreateData){
                            console.log("recordCreateData>>>>>>>>>>>>>>", recordCreateData)
                            res.status(200).json({
                                apiStatus: "Success",
                                msg: "File Upload Successfull into Box",
                                output: results
                            });
                        })

                    }
                })
		    })
		    .catch((err) => {
		        for (const file of files) {
				    fs.unlink(path.join(__dirname, '..', directoryName, file.fileName));
				}
		        res.status(400).json({
                        apiStatus: "failure",
                        msg: err
                    });
		    });
  	   }
  	]
  )
}


function processFiles(client, files, folderId) {
    let fileUploadPromises = [];
    files.forEach((file) => {
        fileUploadPromises.push(uploadAFile(client, folderId, file.fileName, file.content));
    });

    return Promise.all(fileUploadPromises);
}

function uploadAFile(client, folderId, fileName, toUploadFile) {
    return client.files.preflightUploadFile(folderId, { name: fileName, size: toUploadFile.length })
        .then((preflightResults) => {
            if (toUploadFile.length < CHUNKED_UPLOAD_MINIMUM) {
                console.log("Using normal upload...");
                let fileSha = crypto.createHash("sha1").update(toUploadFile).digest("hex");
                client.setCustomHeader("Content-MD5", fileSha);
                return client.files.uploadFile(folderId, fileName, toUploadFile);
            } else {
                console.log("Using chunked upload...");
                client.setCustomHeader("Content-MD5", null);
                return client.files.getChunkedUploader(folderId, toUploadFile.length, fileName, toUploadFile)
                    .then((uploader) => {
                        return new Promise((resolve, reject) => {
                            uploader.on('error', (err) => {
                                reject(err);
                            });

                            uploader.on('chunkUploaded', (part) => {
                                
                            });
                            uploader.on('uploadComplete', (file) => {
                                //console.log('File upload complete!');
                                resolve(file);
                            });
                            //console.log("Starting chunked uploader...");
                            uploader.start();
                        });
                    })
            }
        })
        .catch((err) => {
            let conflictId = handleFileConflictError(err);
            if (conflictId) {
                console.log(`Found existing file with that name: ${conflictId}`);
                return uploadANewFileVersion(client, conflictId, toUploadFile);
            } else {
                throw err;
            }
        });
}


function uploadANewFileVersion(client, conflictId, toUploadFile) {
    if (toUploadFile.length < CHUNKED_UPLOAD_MINIMUM) {
        console.log("Using normal upload...");
        let fileSha = crypto.createHash("sha1").update(toUploadFile).digest("hex");
        client.setCustomHeader("Content-MD5", fileSha);
        // You can optionally rename a folder while uploading a new version.
        // let newFileName = "ubuntu-no-gui.iso";
        // let options = {
        //     name: newFileName
        // }
        // return client.files.uploadNewFileVersion(conflictId, options, toUploadFile);
        return client.files.uploadNewFileVersion(conflictId, toUploadFile);
    } else {
        console.log("Using chunked upload...");
        // You can optionally rename a folder while uploading a new version.
        // let newFileName = "ubuntu-no-gui.iso";
        // let options = {
        //     name: newFileName
        // }
        // return client.files.getNewVersionChunkedUploader(conflictId, toUploadFile.length, toUploadFile, options)
        client.setCustomHeader("Content-MD5", null);
        return client.files.getNewVersionChunkedUploader(conflictId, toUploadFile.length, toUploadFile, null)
            .then((uploader) => {
                return new Promise((resolve, reject) => {
                    uploader.on('error', (err) => {
                        reject(err);
                    });

                    uploader.on('chunkUploaded', (part) => {
                        console.log('Part uploaded...');
                        console.log(part);
                    });
                    uploader.on('uploadComplete', (file) => {
                        console.log('File upload complete!');
                        resolve(file);
                    });
                    console.log("Starting chunked uploader...");
                    uploader.start();
                });
            })
    }
}


function handleFileConflictError(e) {
    if (e && e.response && e.response.body) {
        let errorBody = e.response.body;
        if (errorBody.status === 409) {
            if (errorBody.context_info && errorBody.context_info.conflicts &&
                errorBody.context_info.conflicts) {
                let conflict = errorBody.context_info.conflicts;
                if (conflict && conflict.id) {
                    return conflict.id;
                }
            }
        }
    }
}

function handleFolderConflictError(e) {
    if (e && e.response && e.response.body) {
        let errorBody = e.response.body;
        if (errorBody.status === 409) {
            if (errorBody.context_info && errorBody.context_info.conflicts &&
                errorBody.context_info.conflicts.length > 0) {
                let conflict = errorBody.context_info.conflicts[0];
                if (conflict && conflict.id) {
                    return conflict.id;
                }
            }
        }
    }
}

function removeUploadFiles() {
	fs.readdir(directory, (err, files) => {
	  if (err) throw err;

	  for (const file of files) {
	    fs.unlink(path.join(directory, file), err => {
	      if (err) throw err;
	    });
	  }
	});
}



function authO(cb) {
    //var creddata = {
       var data = {
            grant_type: "password",
            client_id: "3MVG9sSN_PMn8tjRJ5wIqAHjJ1zzmPg2LeP1pP7zLCjqcyJJgt_zrPjIGn7YPd21jz3AphtwhUCq5rUFAlZgB",
            client_secret: "5218324957598203888",
            username:"user_integration@gso1.lly.rbdpdev",
            password: "Integration123$" + "ffkE4CbH51onpiLBLALNlm5v"
       }
    //}
    var args = {
        
    };
    var appendUrl = "grant_type=password&client_id="+ data.client_id +'&client_secret='+data.client_secret+'&username='+data.username+'&password='+ data.password;
     
    client.post("https://gso--rbdpdev.cs89.my.salesforce.com/services/oauth2/token?" + appendUrl, args, function (data, response) {
        // parsed response body as js object
        console.log(data);
        cb(null, data)
    });
}

function createDataSalesForce(uploadFileInfo, accessToken, cb) {
    var args = {
        data: uploadFileInfo ,
        headers: { "Content-Type": "application/json", "Authorization": "Bearer" + " " + accessToken }
    };
    client.post("https://gso--rbdpdev.cs89.my.salesforce.com/services/apexrest/createDocument", args, function (data, response) {
        cb(null, data)
    });
}