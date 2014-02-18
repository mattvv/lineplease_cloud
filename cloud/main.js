
Parse.Cloud.beforeSave("Line", function(request, response) {
  if (!request.object.get("gender")) {
    request.object.set("gender", "Female");
  }
  //ensure character name is in uppercase & trim spaces from front and back
  request.object.set("character", request.object.get("character").toUpperCase().replace(/^\s\s*/, '').replace(/\s\s*$/, ''));

  response.success();
});

Parse.Cloud.afterSave("Line", function(request, response) {
	line = request.object;

	//add line number if it does not exist.
	if (line.get("position") == null) {
		console.log("didn't get a position");
		query = new Parse.Query("Line");
		query.equalTo("scriptId", line.get("scriptId"));
		query.count({
			success: function(count) {
				line.set("position", count-1);
				line.save();
			}, error: function(error) {
				console.log("Error!");
			}
		});
	}

	//check if all of the same character in the script has the same line number.
	query = new Parse.Query("Line");
	query.equalTo("scriptId", line.get("scriptId"));
	query.equalTo("character", line.get("character")); 
	query.find({
		success: function(results) {
			for (var i in results) {
				if (results[i].get("gender") != line.get("gender")) {
					results[i].set("gender", line.get("gender"));
					results[i].save();
				}
			}
		}, error: function(error) {
			console.log("Error fetching characters");
		}
	});

});

//delete script
Parse.Cloud.define('removeScript', function(request, response) {
	var query = new Parse.Query('Script');
	var script;
	query.get(request.params.scriptId).then(function(s) {
		script = s;
		//we have the script, get the lines and remove them one by one.
		var linesQ = new Parse.Query('Line');
		linesQ.equalTo('scriptId', script.id);
		return linesQ.find();
	}).then(function(lines) {
		for (var i in lines) {
			var line = lines[i];
			line.destroy();
		}
		script.destroy();
		response.success();
	}, function(error){
		response.error(error);
	});
})

//delte line
Parse.Cloud.define('removeLine', function(request, response) {
	var query = new Parse.Query('Line');
	query.get(request.params.lineId).then(function(l) {
		var scriptId = l.get('scriptId');
		l.destroy();

		var linesQ = new Parse.Query('Line');
		linesQ.equalTo('scriptId', scriptId);
		linesQ.ascending('position');
		return linesQ.find();
	}).then(function(lines) {
		//reset all the lines to have correct ordering so there are no gaps
		var promises = [];
		for (var i in lines) {
			var line = lines[i];
			console.log('setting line ' + line.get('line') + ' to position ' + i)
			line.set('position', parseInt(i));
			promises.push(line.save());
		}
		return Parse.Promise.when(promises);
	}).then(function() {
		response.success();
	}, function(error) {
		response.error(error);
	})
});

Parse.Cloud.define('conversion', function(request, response) {
	var query = new Parse.Query('Conversion');
	query.get(request.params.conversionId).then(function(c) {
		//assume that the file has already been uploaded and associated correctly. Let's start a conversion

		c.set('status', 'Queued...');
		c.set('percent', 0);
		return c.save();
	}).then(function(c) {
		//this is where we do the web request:
		return Parse.Cloud.httpRequest({
			url: 'http://lineplease.herokuapp.com/conversions/enqueue',
			params: {
				conversionId: c.id,
				username: c.get('username')
			}
		});
	}).then(function() {
		response.success();
	}, function(error) {
		response.error(error);
	});
})

//Defining the Re-order function!
Parse.Cloud.define('reorderLines', function(request, response) {
	var query = new Parse.Query('Line');
	query.get(request.params.lineId).then(function(line) {
		//we have the line!
		var change = line.get('position') - request.params.position;
		var promises = [];

		if (change < 0) {
			//the line has moved down
			change = change * -1;
			change = change + 1;

			//get the lines between the line.
			var starting_position = parseInt(line.get('position')) + 1;
			var final_position = parseInt(request.params.position);

			console.log('looping through lines. to save!')
			for (var i=0;i<(change-1);i++) {
				var promise = new Parse.Promise();
				promises.push(promise);
				//fetch the line to be updated
				var q = new Parse.Query('Line');
				q.equalTo('position', starting_position+i);
				q.equalTo('scriptId', request.params.scriptId);
				q.first().then(function(l) {
					//we have the line to be changed in l.
					console.log('regular: setting line ' + l.id + ' to ' + starting_position-1);
					l.set('position', l.get('position')-1);
					return l.save();
				}).then(function() {
					console.log('resolving promise!');
					promise.resolve();
				}), function(error) {
					console.log('could not find script with position ' + starting_position+i);
					promise.reject(error);
				}
			}
			console.log('regular: setting line ' + line.id + ' to ' + request.params.position);
			line.set('position', request.params.position);
			promises.push(line.save());
		} else {
			change = change + 1;
			var starting_position = parseInt(line.get('position')) - 1;
			var final_position = parseInt(request.params.position);

			console.log('looping through lines. to save! backwards');
			for (var i=0; i<(change-1); i++) {
				var promise = new Parse.Promise();
				promises.push(promise);

				var q = new Parse.Query('Line');
				q.equalTo('position', starting_position-i);
				q.equalTo('scriptId', request.params.scriptId);
				q.first().then(function(l) {
					//we have the line to be changed in l.
					console.log('setting line ' + l.id + ' to ' + starting_position+1);
					l.set('position', l.get('position')+1);
					return l.save();
				}).then(function() {
					promise.resolve();
				}), function(error) {
					promise.reject(error);
				}
			}
			console.log('setting line ' + line.id + ' to ' + request.params.position);
			line.set('position', request.params.position);
			promises.push(line.save());
		}

		console.log('returning the promises to evaluate');
		return Parse.Promise.when(promises);
	}).then(function() {
		console.log('success');
		response.success();
	}), function(error) {
		console.log('error!');
		response.error(error);
	}
});