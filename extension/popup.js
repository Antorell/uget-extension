/*
 * uget-chrome-wrapper is an extension to integrate uGet Download manager
 * with Google Chrome, Chromium, Vivaldi and Opera in Linux and Windows.
 *
 * Copyright (C) 2016  Gobinath
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

$(document).ready(function () {
    // Show the system status
    chrome.runtime.getBackgroundPage(function (backgroundPage) {
        let state = backgroundPage.ugetState();
        if (state === 0) {
            $('#info').css('display', 'block');
            $('#warn').css('display', 'none');
            $('#error').css('display', 'none');
        } else if (state === 1) {
            $('#info').css('display', 'none');
            $('#warn').css('display', 'block');
            $('#error').css('display', 'none');
        } else {
            $('#info').css('display', 'none');
            $('#warn').css('display', 'none');
            $('#error').css('display', 'block');
        }
    });

    chrome.storage.sync.get(function (items) {
        $('#urlsToExclude').val(items["uget-urls-exclude"]);
        $('#urlsToInclude').val(items["uget-urls-include"]);
        $('#mimeToExclude').val(items["uget-mime-exclude"]);
        $('#mimeToInclude').val(items["uget-mime-include"]);
        $('#fileSize').val(parseInt(items["uget-min-file-size"]) / 1024);
        $('#chk_enable').prop('checked', items["uget-interrupt"] == "true");
    });

    // Set event listeners
    $('#chk_enable').change(function () {
        let enabled = this.checked;
        chrome.runtime.getBackgroundPage(function (backgroundPage) {
            backgroundPage.setInterruptDownload(enabled, true);
        });
    });
    $("#fileSize").on("change paste", function () {
        // let minFileSize = isNaN(parseInt($(this).val())) ? 300 : parseInt($(this).val()) < -1
        //     ? -1 : parseInt($(this).val());
        let minFileSize = parseInt($(this).val());

        if (isNaN(minFileSize)) {
            minFileSize = 300;
        } else if (minFileSize < -1) {
            minFileSize = -1;
        }
        $('#fileSize').val(minFileSize);
        chrome.runtime.getBackgroundPage(function (backgroundPage) {
            backgroundPage.updateMinFileSize(minFileSize * 1024);
        });
    });
    $("#urlsToExclude").on("change paste", function () {
        let keywords = $(this).val().toLowerCase().trim().replace(/[\s,]+/g, ', ');
        chrome.runtime.getBackgroundPage(function (backgroundPage) {
            backgroundPage.updateExcludeUrls(keywords);
        });
    });
    $("#urlsToInclude").on("change paste", function () {
        let keywords = $(this).val().toLowerCase().trim().replace(/[\s,]+/g, ', ');
        chrome.runtime.getBackgroundPage(function (backgroundPage) {
            backgroundPage.updateIncludeUrls(keywords);
        });
    });
    $("#mimeToExclude").on("change paste", function () {
        let keywords = $(this).val().toLowerCase().trim().replace(/[\s,]+/g, ', ');
        chrome.runtime.getBackgroundPage(function (backgroundPage) {
            backgroundPage.updateExcludeMIMEs(keywords);
        });
    });
    $("#mimeToInclude").on("change paste", function () {
        let keywords = $(this).val().toLowerCase().trim().replace(/[\s,]+/g, ', ');
        chrome.runtime.getBackgroundPage(function (backgroundPage) {
            backgroundPage.updateIncludeMIMEs(keywords);
        });
    });
});