// ==UserScript==
// @name         Merge Magic - Luminate Duplicate Merge Automation
// @version      0.9
// @description  Helps define master record selection rules and field selection logic to automate the duplicate merge process.
// @author       Erland Sanborn
// @match        https://*.force.com/apex/cv__duplicate_merge_fields?*
// @match        https://*.force.com/apex/duplicate_merge_fields?*
// @match        https://*.force.com/apex/duplicate_merge_accounts?*
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js
// ==/UserScript==

(function() {
    'use strict';
    var db;

    var ruleset;
    var records;
    var fieldRules = {}, masterRules = [];
    var config_select;
    var masterSelectionRulesPanel;
    var masterRecord;

    document.onLoad = init();

    function init() {
        buildInterface();
        initDB();
    }

    function buildInterface() {


	config_select = $("<select id='config_select' style='margin: 10px;' />").change(function() {
            if ( $(this).val() !== '' ) {
                loadRuleset($(this).val());
            }
        });

        masterSelectionRulesPanel = $("<table id='master_selection_rules' style='width: 50%; margin: 15px;' />");
		var saveBtn = $("<a style='margin: 10px;' href='javascript:void(0);'>Save Rule Set</a>").click(saveFieldRules);

        var masterHeader = $("<thead><tr><th>Sort Field</th><th>Sort Type</th><th id='actions'></th></tr></thead>");
        var addLink = $("<a href='javascript:void(0);' style='margin: 10px;'>Add Master Sort Field</a>").click(function() {
            addMasterFieldSelector("createdDate", "descending");
        });

        $(masterHeader).find("#actions").append(addLink);
        $(masterSelectionRulesPanel).append(masterHeader);

        var recalculateMaster = $("<p align='center'><a href='javascript:void(0);' style='margin: 10px;'>Select Master</a></p>")
            .click(selectMaster);

        var ruleName = $("<label style='margin: 10px;'>Ruleset Name: <input type='text' id='client_name' value='Default' />");
        var toggleStaticFieldsBtn = $("<p align='center'><a style='margin: 10px;' href='javascript:void(0);'>Show/Hide Static Fields</a></p>").click(toggleNonInputRows);

        $("#mergeDescription").append("<label style='margin: 10px;'>Select Merge Rule Set</label>")
            .append(config_select)
            .append(ruleName)
            .append(saveBtn)
            .append(masterSelectionRulesPanel);

        $(".mergeactions").append(toggleStaticFieldsBtn).append(recalculateMaster);

        // render rule dropdowns
        $(".detailList tr:has(input)").each(function(i) {
            var label = $(this).find("td.labelCol").text().trim();
            var section = $(this).parent().prev().find("h4").text().trim();
            label = section + " - " + label;
            var cell = $("<td nowrap='nowrap' class='field_rule' name='" + label + "' />");
            var input = $("<select field_name='" + label + "' />");
            var populateBlanks = $("<label><input field_name='" + label + "' type='checkbox' checked class='populate_blanks' /> Fill Blanks</label>")
            .change(function() {
                saveFieldRules();
                applyRuleTo(label);
            });

            $(input).append("<option value='master'>Master</option>")
                .append("<option value='newest-record'>Newest Record</option>")
                .append("<option value='oldest-record'>Oldest Record</option>")
                .append("<option value='newest-value'>Value Descending</option>")
                .append("<option value='oldest-value'>Value Ascending</option>")
                .append("<option value='len-asc'>Char Length Ascending</option>")
                .append("<option value='len-dec'>Char Length Descending</option>");

            $(input).change(function() {
                fieldRules[label].rule = $(this).val();
                applyRuleTo(label);
                saveFieldRules();
            });

            $(cell).append(input).append(populateBlanks);
            $(this).append(cell);
        });

        $("#masterselect .contacthead").addClass('data_column');
        $(".scrollcontainer").css('height', 'auto').css('width', 'auto');
        $("#mergefields .mergecell").css('width', '231px');
        $("#masterselect").css("width", "auto").find(".clearingBox").remove();

        var recalculateFieldRules = $("<p align='left' style='position: absolute; bottom: 0;'><a href='javascript:void(0);'>Re-Apply Field Rules</a></p>")
            .click(applyFieldSelectionRules);
        var contactHead = $("<div class='contacthead rule_column' />").css("height","108px").append(recalculateFieldRules);

        $("#masterselect").append(contactHead).append("<div class='clearingBox'></div>");
        toggleNonInputRows();
    }

    function initDB() {

        var request = window.indexedDB.open("LuminateDuplicateMergeConfig", 3);
        request.onerror = function(event) {
            console.log("Error opening config DB");
        };
        request.onsuccess = function(event) {
            db = event.target.result;

            var objectStore = db.transaction("client_duplicate_merge_rules").objectStore("client_duplicate_merge_rules");

            objectStore.openCursor().onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    $(config_select).append("<option value='" + cursor.value.client_name + "'>" + cursor.value.client_name + "</option>");
                    cursor.continue();
                }
                else {
                    var defaultRuleset = $(config_select).val();
                    if ( defaultRuleset !== '' ) {
                        $("#client_name").val(defaultRuleset);
                        loadRuleset(defaultRuleset);
                    }
                    parsePageFields();
                }
            };
        };

        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            console.log("Creating new DB...");

            var objectStore = db.createObjectStore("client_duplicate_merge_rules", { keyPath : "client_name" });
            objectStore.transaction.oncomplete = function(event) {
                console.log("DB Created");
            };
        };
    }

    function loadRuleset(client_name) {
        if ( client_name !== null ) {
            console.log("loading " + client_name + " ruleset");
            var transaction = db.transaction(["client_duplicate_merge_rules"]);
            var objectStore = transaction.objectStore("client_duplicate_merge_rules");
            var request = objectStore.get(client_name);
            request.onerror = function(event) {console.log("Couldn't load rules for " + client_name);};
            request.onsuccess = function(event) {
                ruleset = request.result;

                masterRules = [];
                for ( var i = 0; i < ruleset.masterRules.length; i++ ) {
                    masterRules[i] = ruleset.masterRules[i];
                }

                for ( var sortField in ruleset.fieldRules ) {
                    fieldRules[sortField] = ruleset.fieldRules[sortField];
                    $("td.field_rule[name='" + sortField + "'] select").val(fieldRules[sortField].rule);
                    $("td.field_rule[name='" + sortField + "'] input.populate_blanks").prop('checked', fieldRules[sortField].overwriteBlanks);
                }
                 // populate master sort area with dropdowns
                populateMasterRules();
                selectMaster();
                applyFieldSelectionRules();
            };

        }
    }

    function parsePageFields() {
        records = [];
        $("#masterselect .data_column").each(function(i) {
            var createdDate = Date.parse($(this).find(".contacthead-extra:contains('Created Date') span").text().trim());
            var user = $(this).find(".contacthead-extra:contains('Created By ID') span").text().trim();
            var onlineRecord = ( user == "Integration User" || user == "Convio Connector" );
            var record = {
                createdDate: {
                    value: createdDate,
                    radioBtn: null
                },
                onlineRecord: {
                    value: onlineRecord ? "true" : "false"
                },
                masterBtn: $(this).find(".mergeChoice")
            };
            records.push(record);
            // add select all links to each column
            var id =  $(this).find("input.mergeChoice").attr("id");
            var selectAll = $("<div align='center'><a href='javascript:void(0);'>Select All Fields</a></div>").click(function() {
                $("input.field-"+id).click();
            });
            $(this).append(selectAll);
        });

        // add True to check box cells, for sorting...
        $("td.dataCol span img.checkImg").each(function() {
            if ( $(this).attr("title") == "Checked" )
                $(this).parent().append("true");
            else
                $(this).parent().append("false");
        });


        // build record objects
        $(".detailList tr:has(.labelCol)").each(function(i) {
            var label = $(this).find("td.labelCol").text().trim();
            // get section h4 header, use as field prefix (occasional duplicate field names)
            var section = $(this).parent().prev().find("h4").text().trim();

            label = section + " - " + label;
            if ( fieldRules[label] === undefined ) {
                fieldRules[label] = {
                    fieldName: label,
                    rule: "master",
                    overwriteBlanks: true
                };
            }
            //ruleset[label];
            $(this).find("td.dataCol").each(function(j) {
                records[j][label] = {
                    value: $(this).find(".field-value-wrapper").text().trim(),
                    radioBtn: $(this).find(".field-input-wrapper input")
                };
            });

        });
    }

    function populateMasterRules() {
        for ( var i = 0; i < masterRules.length; i++ ) {
            //for ( var field in masterRules ) {
            addMasterFieldSelector(masterRules[i].fieldName, masterRules[i].type); // default master sort field
        }
    }

    function sortRecords(field, order) {

        if ( records[0][field] === undefined ) return;

        records.sort(function(a, b) {
            var va = makeSortable(a[field]);
            var vb = makeSortable(b[field]);
            if ( vb === null ) return -1;
            if ( va === null ) return 1;
            return (order == "ascending") ? va - vb : vb - va;
        });

    }

    function selectMaster() {
        console.log("select master");
        // iterate on rules, apply sort, detect data type if possible
        $("#master_selection_rules tr.masterSortField").each(function() {
			var field = $(this).find(".field_sort").val();
			var order = $(this).find(".field_sort_type").val();
            console.log("sorting master", field, order);
            sortRecords(field, order);
		});

        masterRecord = records[0];
        masterRecord.masterBtn.click();
    }

    function applyFieldSelectionRules() {
        $(".field_rule").each(function() {
            applyRuleTo($(this).find("select").attr("field_name"));
        });
    }

    function applyRuleTo(field) { //, rule, populate) {
        var fieldRule = fieldRules[field];
        var rule = fieldRule.rule;
        var overwrite = fieldRule.overwriteBlanks;
        var target_record;

        if ( rule === null ) return;

        switch (rule) {
            case "master" :
                // re-sort records on master rules
                $("#master_selection_rules tr.masterSortField").each(function() {
                    var field = $(this).find(".field_sort").val();
                    var order = $(this).find(".field_sort_type").val();
                    sortRecords(field, order);
                });

                break;
            case "newest-record":
                sortRecords("createdDate", "descending");
                break;
            case "oldest-record":
                sortRecords("createdDate", "ascending");
                break;
            case "newest-value" :
                sortRecords(field, "descending");
                break;
            case "oldest-value":
                sortRecords(field, "ascending");
                break;
            case "len-asc":
                var sortedRecords = records.sort(function(a, b) {
                    var va = makeSortable(a[field]);
                    var vb = makeSortable(b[field]);
                    if ( vb === null ) return -1;
                    if ( va === null ) return 1;
                    return va.length - vb.length;
                });
                break;
            case "len-dec":
                var sortedRecords = records.sort(function(a, b) {
                    var va = makeSortable(a[field]);
                    var vb = makeSortable(b[field]);
                    if ( vb === null ) return -1;
                    if ( va === null ) return 1;
                    return vb.length - va.length;
                });
                break;
            default:
        }

        // post-sort, target record should be first in records array
        target_record = records[0];

        // if target record value is blank and overwrite is true, populate with next best value
        if ( overwrite && target_record[field].value === "") {
            for ( var i = 0; i < records.length; i++ ) {
                if ( records[i][field].value !== '' ) {
                    target_record = records[i];
                    break;
                }
            }
        }

        // select best value
        target_record[field].radioBtn.click();
    }

    function updateMasterSortFields() {
        for ( var i=0; i < masterRules.length; i++ ) {
            var rule = masterRules[i];
            addMasterFieldSelector(rule.fieldName, rule.type);
        }
        selectMaster();
    }
    function addMasterFieldSelector(field_name, type) {
        var defaultMasterSelectRule = $("<select class='field_sort' />").change(selectMaster);

		$(defaultMasterSelectRule).append("<option value='createdDate'>Created Date</option>");
        $(defaultMasterSelectRule).append("<option value='onlineRecord'>Online Record (1/0)</option>");
        var fields = Object.keys(fieldRules).sort();

        // concat fields with all known field names

        for ( var i=0; i < fields.length; i++ ) {
            var fieldName = fields[i];//$(this).text().trim();
            $(defaultMasterSelectRule).append("<option value='"+fieldName+"'>" + fieldName + "</option");
        }

		if ( field_name !== null )
			$(defaultMasterSelectRule).val(field_name);

        var defaultSortType = $("<select class='field_sort_type' />")
            .append("<option value='ascending'>Ascending</option>")
            .append("<option value='descending'>Descending</option>").val(type).change(selectMaster);

		var fieldCell = $("<td />").append(defaultMasterSelectRule);
		var typeCell = $("<td />").append(defaultSortType);

		var removeLink = $("<a href='javascript:void(0);'>Remove</a>").click(function() {
			$(row).remove();
		});
		var addRemove = $("<td />").append(removeLink);

		var row = $("<tr class='masterSortField' field_name='" + field_name + "' />").append(fieldCell).append(typeCell).append(addRemove);

		$(masterSelectionRulesPanel).append(row);
    }

    function saveFieldRules() {
        var transaction = db.transaction(["client_duplicate_merge_rules"], "readwrite");
        var objectStore = transaction.objectStore("client_duplicate_merge_rules");
        //var fieldRules = {}, masterRules = {};
        var client_name = $("#client_name").val();

        console.log("saving: ", fieldRules);

        $(".field_rule").each(function() {
            var select = $(this).find("select");
            var fieldName = $(select).attr("field_name");
            var rule = $(select).val();
            var overwriteBlanks = $(this).find(".populate_blanks").is(":checked");
            fieldRules[fieldName] = {
                fieldName: fieldName,
				rule: rule,
				overwriteBlanks: overwriteBlanks
			};
        });
        masterRules = [];
		$("#master_selection_rules .masterSortField").each(function() {
			var field = $(this).find(".field_sort").val();
			var type = $(this).find(".field_sort_type").val();

			masterRules.push({
                fieldName: field,
				type: type
			});
		});

        var data = {
            client_name: client_name,
			masterRules: masterRules,
			fieldRules: fieldRules
        };

        var request = objectStore.put(data);
        request.onsuccess = function(event) {

        };
        transaction.oncomplete = function(event) {
            console.log("Ruleset Saved");
        };

        transaction.onerror = function(event) {
            // Don't forget to handle errors!
            console.log("Error updating db");
        };
    }

    function getRecordWithMaxDate(field) {
        var res = Math.max.apply(Math,records.map(function(o){return o[field];}));
        var obj = records.find(function(o){ return o[field] == res; });

        return obj;
    }
    function getRecordWithMinDate(field) {
        var res = Math.min.apply(Math,records.map(function(o){return o[field];}));
        var obj = records.find(function(o){ return o[field] == res; });

        return obj;
    }

    function makeSortable(field) {
        var value = field.value;
        if ( isDate(field.value) )
            value = Date.parse(field.value);
        else if( isCurrency(field.value) ) {
            // check for monetary range $X - $Z, reduce to X
            var values = field.value.split("-");
            value = parseFloat(values[0].replace("$", "").trim());
        }
        else if ( isInteger(field.value) ) {
            value = parseInt(field.value);
        }
        else if ( isBool(field.value) ) {
            value = (field.value === "true") ? 1 : 0;
        }
        else if ( value === "" )
            value = null;
        return value;
    }
    function isBool(value) {
        return ( value === "true" || value === "false" );
    }
    function isDate(value) {
        return !isNaN(Date.parse(value));
    }
	function isCurrency(value) {
		return ( value !== undefined && typeof(value) === "string" && value.charAt(0) === '$');
	}
	function isInteger(value) {
		return !isNaN(parseInt(value)) && value == parseInt(value);
	}
    function toggleNonInputRows() {
        $(".detailList tr:not(:has(input))").toggle();
    }


})();
