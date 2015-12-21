var fs = require('fs');
var path = require('path');
var async = require('async');
module.exports = function(app) {

    var files = fs.readdirSync(__dirname);

    console.log('files: ' + files);
    var apifiles = [];
    var productfiles = [];
    var subscriptionfiles = [];
    var catalogfiles = [];
    async.each(files, function(file, done) {
        //console.log('file: ' + file);
        if (file.indexOf('apis-') > -1)
                {
                console.log('apis file: ' + file);
                apifiles.push(file);
                }
        if (file.indexOf('products-') > -1)
                {
                console.log('products file: ' + file);
                productfiles.push(file);
                }
        if (file.indexOf('subs-') > -1)
                {
                console.log('subscriptions file: ' + file);
                subscriptionfiles.push(file);
                }
        if (file.indexOf('catalogs-') > -1)
                {
                console.log('catalogs file: ' + file);
                catalogfiles.push(file);
                }
        });

    // Populate catalogs
    async.each(catalogfiles, function(catalogfile, done) {
        var file = path.join(__dirname, catalogfile);
        console.log('Loading data from %s', file);
        var readcatalog = JSON.parse(fs.readFileSync(file));
        console.log('filecontents: ' + readcatalog);
        app.dataSources.db.automigrate('catalog', function(err) {
                if (err) throw err;

                app.models.catalog.create(readcatalog, function(err, catalogs) {
                        if (err) throw err;

                        console.log('catalogs created: %j', catalogs);

                        });

                });
        });

    // Populate products
    async.each(productfiles, function(productfile, done) {
        var file = path.join(__dirname, productfile);
        console.log('Loading data from %s', file);
        var readproduct = JSON.parse(fs.readFileSync(file));
        console.log('filecontents: ' + readproduct);
        app.dataSources.db.automigrate('product', function(err) {
                if (err) throw err;

                app.models.product.create(readproduct, function(err, products) {
                        if (err) throw err;

                        console.log('products created: %j', products);

                        });

                });
        });

    // Populate apis
    async.each(apifiles, function(apifile, done) {
        var file = path.join(__dirname, apifile);
        console.log('Loading data from %s', file);
        var readapi = JSON.parse(fs.readFileSync(file));
        console.log('filecontents: ' + readapi);
	app.dataSources.db.automigrate('api', function(err) {
    		if (err) throw err;

    		app.models.api.create(readapi, function(err, apis) {
      			if (err) throw err;

      			console.log('apis created: %j', apis);

    			});

        	});
	});

    // Populate subscriptions
    async.each(subscriptionfiles, function(subscriptionfile, done) {
        var file = path.join(__dirname, subscriptionfile);
        console.log('Loading data from %s', file);
        var readsubscription = JSON.parse(fs.readFileSync(file));
        console.log('filecontents: ' + readsubscription);
        app.dataSources.db.automigrate('subscription', function(err) {
                if (err) throw err;

                app.models.subscription.create(readsubscription, 
			function(err, subscriptions) {
                        if (err) throw err;

                        console.log('subscriptions created: %j', subscriptions);

                        });

                });
        });

};
