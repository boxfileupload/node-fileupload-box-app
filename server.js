var express = require('express');
var app = express();
var path = require('path');
var formidable = require('formidable');
var fs = require('fs');
app.set('port', (process.env.PORT || 3000))

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res){
  res.sendFile(path.join(__dirname, 'views/index.html'));
});


require('./fileuploader')(app,fs);

var server = app.listen(app.get('port'), function(){
  console.log('Server listening on port', app.get('port'));
});
