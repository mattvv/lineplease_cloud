
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
	if (!line.get("position")) {
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