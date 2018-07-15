const express = require('express');
const app = express();
require('rootpath')();

//const config = require('appconfig.json');

const fs = require("fs");
const path = require("path");
const box = require("box-node-sdk");
const crypto = require('crypto');

let configFile = fs.readFileSync('appconfig.json');
configFile = JSON.parse(configFile);
//console.log("configFile>>>>>>>>>", configFile)

let session = box.getPreconfiguredInstance(configFile);
//console.log("1")
let client = session.getAppAuthClient("enterprise");
//console.log("2")

const CHUNKED_UPLOAD_MINIMUM = 20000000;

const parentFolderId = "0";
const directoryName = "uploadFolder";
let files = [];

fs.readdirSync(directoryName).forEach((file) => {
    files.push({ fileName: file, content: fs.readFileSync(path.join(__dirname, directoryName, file)) });
});
//console.log("3")
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
            throw err;
        }
    })
    .then((results) => {
        console.log("results>>>>>>>>>",JSON.stringify(results));
    })
    .catch((err) => {
        console.log("err>>>>>>>>>>>",err);
    });

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
            console.log(preflightResults);
            console.log("toUploadFile.length>>>>>>>>>", toUploadFile.length)
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

console.log("4")

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


app.listen(3000, function() {
    console.log("Server is listening at 3000");
})