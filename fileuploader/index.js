module.exports = function(app,fs) {
	fs.readdirSync(__dirname).forEach(function (file, indexer) {
		if (file.indexOf('.js') < 0 || file == 'index.js' ) {
			return true;
		} else if( file == 'uploaderRoutes.js'){
			 	require('./' + file)(app);
		}
	})
}