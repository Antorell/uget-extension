/*
 * uGet Integration is an extension to integrate uGet Download manager
 * with Google Chrome, Chromium, Vivaldi, Opera and Mozilla Firefox in Linux and Windows.
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the2
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/*                                                                                            */
/*  The modifications work with Firefox + Uget + Aria2. Uget + Curl, or Chrome, untested.     */
/*  I'm not a Js dev, or a dev at all, so don't mind me if it's not up to js coding standards */
/*                                                                                            */
const UGET_EXTENSION_VERSION = "2.1.3";
const UGET_REQ_INTEGRATOR_VERSION = "1.0.0";
const UgetIncludeDefaultMIME = ["3gp", "7z", "aac", "apk", "appx", "appxbundle", "avi", "bin", "bz2", "cab", "dat", "deb", "dmg", "esd",
    "exe", "f4v", "flac", "flv", "gz", "iso", "lzh", "img", "m4a", "m4b", "m4p", "mkv", "mov", "mp3", "mp4", "mpeg", "mpg", "msi", "msu",
    "msixbundle", "ogg", "ogv", "rar", "rmvb", "rpm", "tar", "tgz", "vmdk", "wav", "webm", "wma", "wmv", "xz", "matroska", "z", "zip"];
const UgetExcludeDefaultMIME = ["xml", "text", "rss", "json", "html", "javascript", "nfo", "torrent", "srt"];
const UgetExcludeDefaultURL = ["drive.google.com", "docs.google.com"];
const UgetIncludeDefaultURL = [];
// const UgetIncludeDefaultURL = ["onedrive.live.com"];
var ugetInterruptSwitch = true;
var ugetIntegratorNotFound = true;
var ugetIsFoundRedirect = false;
var ugetIntegratorVersion;
var UgetMinFsToInterrupt = 300 * 1024; // 300 KB
var ugetUrlsToSkip = [];
var ugetUrlsToInterrupt = [];
var ugetMimeToSkip = [];
var ugetMimeToInterrupt = [];
var ugetMessage = {
    Batch: false,
    Cookies: '',
    FileName: '',
    FileSize: '',
    PostData: '',
    Referer: '',
    URL: '',
    UserAgent: navigator.userAgent,
    Version: UGET_EXTENSION_VERSION
};
function start() {
    initialize();
    readStorage();
    setDownloadHooks();
}
/**
 * Initialize the variables.
 */
function initialize() {
    // Set keyboard shortcut listener
    chrome.commands.onCommand.addListener(function (command) {
        if ("toggle-interruption" === command) {
            // Toggle
            setInterruptDownload(!ugetInterruptSwitch, true);
        }
    });
    sendMessageToHost(ugetMessage);
    createContextMenus();
}
/**
 * Read storage for extension specific preferences.
 * If no preferences found, initialize with default values.
 */
function readStorage() {
    chrome.storage.sync.get(function (items) {
        // Read the storage for excluded keywords
        updateExcludeUrls(items["uget-urls-exclude"]);
        // Read the storage for included keywords
        updateIncludeUrls(items["uget-urls-include"]);
        // Blacklist
        updateExcludeMIMEs(items["uget-mime-exclude"]);
        // Whitelist
        updateIncludeMIMEs(items["uget-mime-include"]);
        // Read the storage for the minimum file-size to interrupt
        updateMinFileSize(items["uget-min-file-size"] ?? UgetMinFsToInterrupt);
        // Read the storage for enabled flag
        if (!items["uget-interrupt"]) {
            // Keep the value string
            //???? When is it supposed be empty? On first install?
            chrome.storage.sync.set({
                "uget-interrupt": 'true'
            });
        } else {
            let interrupt = (items["uget-interrupt"] == "true");
            setInterruptDownload(interrupt);
        }
    });
}
/**
 * Create required context menus and set listeners.
 */
function createContextMenus() {
    chrome.contextMenus.create({
        title: 'Download with uGet',
        id: "download_with_uget",
        contexts: ['link']
    });
    chrome.contextMenus.create({
        title: 'Download all links with uGet',
        id: "download_all_links_with_uget",
        contexts: ['page']
    });
    chrome.contextMenus.onClicked.addListener(function (info, tab) {
        "use strict";
        if (info.menuItemId === "download_with_uget") {
            ugetMessage.URL = info.linkUrl;
            ugetMessage.Referer = info.pageUrl;
            cookiesGetAll(info.pageUrl);
        } else if (info.menuItemId === "download_all_links_with_uget") {
            chrome.tabs.executeScript(null, {
                file: 'extract.js'
            }, function (results) {
                if (results[0].success) {
                    ugetMessage.URL = results[0].urls;
                    ugetMessage.Referer = info.pageUrl;
                    ugetMessage.Batch = true;
                    cookiesGetAll(info.pageUrl);
                }
            });
        }
    });
}
/**
 * Set hooks to interrupt downloads.
 */
function setDownloadHooks() {
    chrome.webRequest.onHeadersReceived.addListener(ugetOnHeaderReceived,
        {
            urls: ['https://*/*', 'http://*/*'],
            // types: ['main_frame', 'sub_frame']
            types: ['main_frame']
        }, ['responseHeaders', 'blocking']
    );
}
/*********************************************************/
/*       DownloadHook  onHeadersReceived                 */
/*********************************************************/
function ugetOnHeaderReceived(details) {
    if (ugetInterruptSwitch && ugetPreTriage(details.url)) {
        let contentType = ugetFilterRespHeader(details.responseHeaders, 'content-type')[0]?.value
            ?? (ugetFilterRespHeader(details.responseHeaders, 'content-disposition', 'accept-ranges')[1]?.name
                ? 'application/octet-stream' : 'text/html');
        if (!(/^text\/|^image\//i).test(contentType) && !isURLBlacklisted(details.initiator, details.url)) {
            ugetMessage.URL = details.url;
            ugetMessage.FileName = ugetContentDispFilename(ugetFilterRespHeader(details.responseHeaders, 'content-disposition')[0]?.value)
            let ugetFileExt = ugetStripExtension(ugetMessage.FileName || details.url);
            let contentLength = parseInt(ugetFilterRespHeader(details.responseHeaders, 'content-length')[0]?.value);
            // fix this/find better way -> cdn dl without a content lengh response header 
            ugetMessage.FileSize = contentLength
                ? contentLength : contentType.includes('application/')
                    ? UgetMinFsToInterrupt + 1024 : 0;
            ugetMessage.Referer = details.initiator || details.url;
            if (ugetMessage.FileSize >= UgetMinFsToInterrupt) {
                if (!isContentBlacklisted(ugetFileExt) && (IsURLWhitelisted(details.initiator, details.url) || isContentWhitelisted(ugetFileExt))) {
                    return (cookiesGetAll(details.initiator), { redirectUrl: "javascript:" });
                }
            }
        }
    }
    return ({ responseHeaders: details.responseHeaders });
}
///////////////////////////////////////////////////////
////////////////// Utility Functions //////////////////
function ugetPreTriage(url) {
    url = new URL(url);
    return !(/\/$|\.html?$|\.srf$/).test(url.pathname) && ((/\.\w{1,10}$/).test(url.pathname) || (/download|file(?:name|id|Install)/i).test(url.search));
}
function ugetFilterRespHeader(responseHeaders, header1, header2) {
    return responseHeaders.filter(item => item.name?.toLowerCase() === header1 || item.name?.toLowerCase() === header2)
}
function ugetContentDispFilename(content) {
    // Uget-Integrator's "uget-integrator.py" basename(unquote(data['FileName'])) replace the %xx escapes
    return (/filename\*?=./i).test(content)
        // ? content.split(';', 2).pop().match(/(?<=filename\*?=["'\\]{0,2})(?:UTF-\d'{2})?([^"'\\]+\.\w{1,10})/i).pop() : '';
        ? content.split(';', 2).pop().match(/[^"'=\\]+\.\w{1,10}/).pop() : '';
}
function ugetStripExtension(urlfln) {
    urlfln = urlfln.toLowerCase();
    // // URL
    if ((/^https?:|^ftp:/i).test(urlfln)) {
        urlfln = new URL(urlfln).pathname;
    } // Filename
    return (/\.\w{1,10}$/).test(urlfln)
        ? urlfln.split('.').pop() : (/^(?:application|video|image|audio)\//i).test(urlfln)
            ? urlfln.split(/[;/]/, 2).pop().split('-', 2).pop() : '';
}
function ugetRootURL(url) {
    return url && url !== "null" ? new URL(url).origin : undefined;
}
function ugetStripHostname(url) {
    return url && url !== "null" ? new URL(url).hostname : undefined;
}
/**
 * Check whether or not to interrupt the given url.
 */
function isURLBlacklisted(originurl, url) {
    return !!ugetUrlsToSkip.filter((item) => item === ugetStripHostname(originurl) || item === ugetStripHostname(url))[0];
}
function IsURLWhitelisted(originurl, url) {
    return !!ugetUrlsToInterrupt.filter((item) => item === ugetStripHostname(originurl) || item === ugetStripHostname(url))[0];
}
/** 
 * Check if file extension should be downloaded or not.
 */
function isContentBlacklisted(extension) {
    return ugetMimeToSkip.includes(extension);
}
function isContentWhitelisted(extension) {
    return ugetMimeToInterrupt.includes(extension);
}
/**
 * Enable/Disable the plugin and update the plugin icon based on the state.
 */
function setInterruptDownload(interrupt, writeToStorage) {
    ugetInterruptSwitch = interrupt;
    if (writeToStorage) {
        chrome.storage.sync.set({
            "uget-interrupt": interrupt.toString()
        });
    }
    changeIcon();
}
/*
 * Send ugetMessage to uget-integrator
 */
function sendMessageToHost(ugetMessage) {
    chrome.runtime.sendNativeMessage('com.ugetdm.chrome', ugetMessage, function (response) {
        ugetIntegratorNotFound = !response;
        if ((!ugetIntegratorNotFound && !ugetIntegratorVersion) || !ugetMessage.URL) {
            ugetIntegratorVersion = response.Version;
            //ugetVersion = response.Uget;
            changeIcon();
        }
    });
    clearMessage();
}
/**
 * Return the internal state.
 */
function ugetState() {
    return (ugetIntegratorNotFound || !ugetIntegratorVersion)
        ? 2 : !ugetIntegratorVersion.startsWith(UGET_REQ_INTEGRATOR_VERSION)
            ? 1 : 0;
}
function cookiesGetAll(url) {
    url = ugetRootURL(url);
    return url ? chrome.cookies.getAll({ 'url': url }, parseCookies) : parseCookies([]);
}
function parseCookies(cookies_arr) {
    let cookies = '';
    if (cookies_arr[0]) {
        for (let i in cookies_arr) {
            cookies += cookies_arr[i].domain + '\t';
            cookies += (cookies_arr[i].httpOnly ? "FALSE" : "TRUE") + '\t';
            cookies += cookies_arr[i].path + '\t';
            cookies += (cookies_arr[i].secure ? "TRUE" : "FALSE") + '\t';
            cookies += Math.round(cookies_arr[i].expirationDate) + '\t';
            cookies += cookies_arr[i].name + '\t';
            cookies += cookies_arr[i].value;
            cookies += '\n';
        }
    }

    ugetMessage.Cookies = cookies;
    sendMessageToHost(ugetMessage);
}
/**
 * Clear the ugetMessage.
 */
function clearMessage() {
    ugetMessage = {
        Batch: false,
        Cookies: '',
        FileName: '',
        FileSize: '',
        PostData: '',
        Referer: '',
        URL: '',
        UserAgent: navigator.userAgent,
        Version: UGET_EXTENSION_VERSION
    }
}
/**
 * Update the exclude keywords.
 * Is called from the popup.js.
 */
function updateExcludeUrls(exclude) {
    ugetUrlsToSkip = exclude ? exclude.toLowerCase().split(/[\s,]+/).filter(Boolean).concat(UgetExcludeDefaultURL) : UgetExcludeDefaultURL;
    chrome.storage.sync.set({
        "uget-urls-exclude": exclude
    });
}
/**
 * Update the include keywords.
 * Is called from the popup.js.
 */
function updateIncludeUrls(include) {
    ugetUrlsToInterrupt = include ? include.toLowerCase().split(/[\s,]+/).filter(Boolean).concat(UgetIncludeDefaultURL) : UgetIncludeDefaultURL;
    chrome.storage.sync.set({
        "uget-urls-include": include
    });
}
/**
 * Update the exclude MIMEs.
 * Is called from the popup.js.
 */
function updateExcludeMIMEs(exclude) {
    ugetMimeToSkip = exclude ? exclude.toLowerCase().split(/[\s,]+/).filter(Boolean).concat(UgetExcludeDefaultMIME) : UgetExcludeDefaultMIME;
    chrome.storage.sync.set({
        "uget-mime-exclude": exclude
    });
}
/** 
 * Update the include MIMEs.
 * Is called from the popup.js.
 */
function updateIncludeMIMEs(include) {
    ugetMimeToInterrupt = include ? include.toLowerCase().split(/[\s,]+/).filter(Boolean).concat(UgetIncludeDefaultMIME) : UgetIncludeDefaultMIME;
    chrome.storage.sync.set({
        "uget-mime-include": include
    });
}
/**
 * Update the minimum file size to interrupt.
 * Is called from the popup.js.
 */
function updateMinFileSize(size) {
    UgetMinFsToInterrupt = size;
    chrome.storage.sync.set({
        "uget-min-file-size": size
    });
}
/**
 * Change extension icon based on current state.
 */
function changeIcon() {
    let state = ugetState();
    let iconPath = "./icons/icon_32.png";
    if (!ugetInterruptSwitch && state === 0) {
        iconPath = "./icons/icon_disabled_32.png";
    } else if (state === 1) {
        // Warning
        iconPath = "./icons/icon_warning_32.png";
    } else if (state === 2) {
        // Error
        iconPath = "./icons/icon_error_32.png";
    }
    chrome.browserAction.setIcon({
        path: iconPath
    });
}
start();
