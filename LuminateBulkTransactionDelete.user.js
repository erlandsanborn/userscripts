// ==UserScript==
// @name         LO Transaction Deleter
// @version      1.0
// @description  Loads a csv of transaction ids and iteratively deletes them all.
// @author       Erland Sanborn
// @match        https://secure2.convio.net/*
// @match        https://secure3.convio.net/*
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js
// @require      https://ajax.googleapis.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js
// ==/UserScript==

(function() {
    'use strict';
    var origin = document.location.origin;
    var org = document.location.pathname.split("/")[1];
    var url = origin + "/" + org + "/admin/TransactionAdmin/";
    var tx_ids;
    var total_records = 0;
    var deleted_count = 0;
    var deleting = false;

    var loadBtn = $("<input type='file' id='inputFile' name='tx_ids' />").change(function(e) {
        var file = e.target.files[0];
        var fr = new FileReader();
        fr.onload = function(e) {
            var data = e.target.result;
            tx_ids = data.split('\n');
            total_records = tx_ids.length;
        };
        fr.readAsText(file);
    });

    var dialog = $("<div title='Deleting...' />");
    var progress = $("<div id='progressbar' />");
    dialog.append(progress);

    var startBtn = $("<input type='button' value='Delete Transactions' />").click(function() {
        deleting = true;
        $(dialog).dialog({
            resizable: false,
            draggable: false,
            closeOnEscape: false,
            beforeClose: function() { deleting = false; },
            buttons: {
                "Stop" : function() {
                    deleting = false;
                    $(this).dialog("close");
                }
            }
        });
        deleteNextTransaction();
    });

    var panel = $("<div style='padding: 10px; text-align:right;' />").append(loadBtn).append(startBtn);


    $(function() {
        $("head").append("<link rel='stylesheet' type='text/css' href='https://erlandsanborn.github.io/userscripts/LuminateMergeMagic/style.css' />");

        panel.insertAfter("#PageTitle");
    });

    function deleteNextTransaction() {
        var tx_id = tx_ids.shift();

        if ( tx_id == "" || !deleting ) {
            dialog.dialog("close");
            return;
        }

        var postData = {
            pay_action_id : "del_tr_gift",
            pay_trans_id : tx_id,
            pay_cc_action : "recordCC",
            fullRefundOption : "true",
            pay_popped : "T",
            refresh_parent : "T",
            pay_list_action_page : "t",
            pg : "action",
            pay_refund_confirm : "Confirm"
        };
        $.post(url, postData, function(response) {
            deleted_count++;
            $(progress).progressbar({
                value: 100* deleted_count / total_records
            });
            deleteNextTransaction();
        });
    }

})();
