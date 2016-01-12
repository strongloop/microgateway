var fs = require('fs');
var path = require('path');
var debug = require('debug')('strong-gateway:data-store');

/**
 * Creates a model type 
 * @class
 * @param {string} name - name of the model
 * @param {string} prefix - file name prefix associated with the model
 */ 
function modelType(name, prefix) {
    this.name = name;
    this.prefix = prefix;
    this.files = [];
}

module.exports = function(app) {

    var files = fs.readdirSync(__dirname);
    debug('files: ', files);

    // Associate models with file names containing data that should be used
    // to populate the relevant model(s)
    // This section would need to be updated whenever new models are added
    // to the data-store
    var models = [];
    models[models.length] = new modelType('catalog',
                                       'catalogs-');
    models[models.length] = new modelType('product', 
                                       'products-');
    models[models.length] = new modelType('api',
                                       'apis-');
    models[models.length] = new modelType('subscription',
                                       'subs-');

    // read the content of the files into memory
    files.forEach(
        function(file) {
            for(var i = 0; i < models.length; i++) {
                if(file.indexOf(models[i].prefix) > -1) {
                    debug('%s file: %s', models[i].name, file);
                    models[i].files.push(file);
                    break;
                }
            }
        }
    );

    // populate data-store models with the file contents
    models.forEach(
        function(model) {
            model.files.forEach(
                function(typefile) {
                    var file = path.join(__dirname, typefile);
                    debug('Loading data from %s', file);
                    var readfile = JSON.parse(fs.readFileSync(file));
                    debug('filecontents: ', readfile);
                    app.dataSources.db.automigrate(
                        model.name,
                        function(err) {
                            if (err) throw err;
                            app.models[model.name].create(
                                readfile,
                                function(err, mymodel) {
                                    if (err) throw err;
                                    debug('%s created: %j',
                                          model.name,
                                          mymodel);
                                }
                            );
                        }
                    );
                }
            );
        }
    );
};
