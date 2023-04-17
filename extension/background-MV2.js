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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
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
    "exe", "f4v", "flac", "flv", "gz", "iso", "lzh", "img", "m4a", "m4p", "mkv", "mov", "mp3", "mp4", "mpeg", "mpg", "msi", "msu",
    "msixbundle", "ogg", "ogv", "rar", "rmvb", "rpm", "tar", "tgz", "vmdk", "wav", "webm", "wma", "wmv", "xz", "matroska", "z", "zip"];
const UgetExcludeDefaultMIME = ["xml", "text", "rss", "json", "html", "javascript"];
const UgetExcludeDefaultURL = ["drive.google.com", "docs.google.com"];
const UgetIncludeDefaultURL = [];
// const UgetIncludeDefaultURL = ["onedrive.live.com"];
const ugetHostName = window.browser ? 'com.ugetdm.firefox' : 'com.ugetdm.chrome';
const ugetBlockingProperty = window.browser ? { cancel: true } : { redirectUrl: "javascript:" };
var ugetInterruptSwitch = true;
var ugetIntegratorNotFound = true;
var ugetIsFoundRedirect = false;
var ugetIntegratorVersion;
// var filter = [];
var UgetMinFsToInterrupt = 300 * 1024; // 300 KB
var ugetUrlsToSkip = [];
var ugetUrlsToInterrupt = [];
var ugetMimeToSkip = [];
var ugetMimeToInterrupt = [];
//var ugetMediaInTab = {}; //
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
//////////// debug valiable
// var mydetails;

function start() {
    initialize();
    readStorage();
    setDownloadHooks();
    // enableVideoGrabber();
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
    // chrome.contextMenus.create({
    //     title: 'Download media with uGet',
    //     id: "download_media_with_uget",
    //     enabled: false,
    //     contexts: ['page']
    // });
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
        // else if (info.menuItemId === "download_media_with_uget") {
        //     if ((info.pageUrl).includes('/www.youtube.com/watch?v=')) {
        //         // Youtube never tested. 
        //         ugetMessage.URL = info.pageUrl;
        //         ugetMessage.Referer = info.pageUrl;
        //         cookiesGetAll(info.pageUrl);
        //     } else {
        //         // Other videos
        //         let media_set = ugetMediaInTab[tab['id']];
        //         if (media_set) {
        //             let urls = Array.from(media_set);
        //             let no_or_urls = urls.length;
        //             if (no_or_urls == 1) {
        //                 ugetMessage.URL = urls[0];
        //                 ugetMessage.Referer = info.pageUrl;
        //                 cookiesGetAll(info.pageUrl);
        //             } else if (no_or_urls > 1) {
        //                 ugetMessage.URL = urls.join('\n');
        //                 ugetMessage.Referer = info.pageUrl;
        //                 ugetMessage.Batch = true;
        //                 cookiesGetAll(info.pageUrl);
        //             }
        //         }
        //     }
        // }
    });
}
/**
 * Set hooks to interrupt downloads.
 */
function setDownloadHooks() {

    chrome.webRequest.onBeforeRequest.addListener(
        ugetBeforeRequest,
        {
            urls: ['https://*/*', 'http://*/*', 'ftp://*/*'],
            types: ['main_frame', 'sub_frame']
        }
    );
    //infinite loops when onBeforeRequest.addListener(function (mydonkeyass){
    function ugetBeforeRequest(requestdetails) {
        if ((ugetPreTriage(requestdetails.url) || IsURLWhitelisted(requestdetails.url, (requestdetails.originUrl ?? requestdetails.initiator)) || ugetIsFoundRedirect)
            && ugetInterruptSwitch && !ugetIntegratorNotFound) {
            ugetIsFoundRedirect = false;
            ugetIntercepted();
        }
    }
    function ugetIntercepted() {
        chrome.webRequest.onHeadersReceived.addListener(ugetOnHeaderReceived,
            {
                urls: ['https://*/*', 'http://*/*', 'ftp://*/*'],
                types: ['main_frame', 'sub_frame']
            }, ['responseHeaders', 'blocking']
        );
    }
}
/*********************************************************/
/*       DownloadHook  onHeadersReceived                 */
/*      keep outside setDownloadHooks(){}                */
/*     loads multiple instances of uget                  */
/*    if inside onHeadersReceived.addListener            */
/*    onHeadersReceived.addListener(function(myass)      */

function ugetOnHeaderReceived(details) {
    // details.responseHeaders -> [Array{Json}]
    // mydetails = details;
    // ugetIsFoundRedirect = details.statusCode === 302 ? true : false;
    let contentType = (ugetFindResponseHeader(details.responseHeaders, 'content-type') ?? 'text/html');
    if (details.statusCode === 302) {
        ugetIsFoundRedirect = true;
        contentType = 'text/html';
    }
    if (!contentType.includes('text/')) {
        ugetMessage.URL = details.url;
        ugetMessage.Referer = details.originUrl || '';
        ugetMessage.FileName = ugetContentDispFilename(ugetFindResponseHeader(details.responseHeaders, 'content-disposition'));
        let ugetFileExt = ugetStripExtension(ugetMessage.FileName || ugetMessage.URL || contentType);
        let contentLength = parseInt(ugetFindResponseHeader(details.responseHeaders, 'content-length'));
        // fix this/find better way -> cdn dl without a content lengh response header 
        // so it's finally causing issues I could notice. 
        ugetMessage.FileSize = contentLength
            ? contentLength : contentType.includes('application/')
                ? UgetMinFsToInterrupt + 1024 : 0;
        // Ignore whitelisted extension/content check when url is whitelisted, doesn't ignore the content/extension blacklist.
        if (ugetMessage.FileSize >= UgetMinFsToInterrupt && (IsURLWhitelisted(ugetMessage.URL, details.originUrl) || !isURLBlacklisted(ugetMessage.URL, details.originUrl))) {
            return !isContentBlacklisted(ugetFileExt) && (IsURLWhitelisted(ugetMessage.URL, details.originUrl) || isContentWhitelisted(ugetFileExt))
                ? (cookiesGetAll(details.originUrl), ugetBlockingProperty) : ({ responseHeaders: details.responseHeaders }, ugetDeleteListener());
        }
        // if (IsURLWhitelisted(ugetMessage.URL, details.originUrl) || !isURLBlacklisted(ugetMessage.URL, details.originUrl)) {
        //     if (ugetMessage.FileSize >= UgetMinFsToInterrupt) {
        //         console.log('bob')
        //         return !isContentBlacklisted(ugetFileExt) && (IsURLWhitelisted(ugetMessage.URL, details.originUrl) || isContentWhitelisted(ugetFileExt))
        //             ? (cookiesGetAll(details.originUrl), ugetBlockingProperty) : ({ responseHeaders: details.responseHeaders }, ugetDeleteListener());
        //     }
        // }
        //test 2
        // Ignore content/extension whitelist/blacklist checks when url is whitelisted
        // if (IsURLWhitelisted(ugetMessage.URL, details.originUrl) || !isURLBlacklisted(ugetMessage.URL, details.originUrl)) {
        //     return UgetMinFsToInterrupt <= ugetMessage.FileSize
        //         && (IsURLWhitelisted(ugetMessage.URL, details.originUrl) || isContentWhitelisted(ugetFileExt) && !isContentBlacklisted(ugetFileExt))
        //         ? (cookiesGetAll(details.originUrl), { cancel: true }, { redirectUrl: "javascript:" }) : ({ responseHeaders: details.responseHeaders }, ugetDeleteListener());
        // }
    }
    return ({ responseHeaders: details.responseHeaders }, ugetDeleteListener());
}
////////////////// Utility Functions //////////////////
function ugetPreTriage(url) {
    url = new URL(url);
    return (/(?=\.\w{1,10}$)(?!\.html?$|\.srf$|\.js$)/i).test(url.pathname) || (/download|file(?:name|id)/i).test(url.search);
}
function ugetFindResponseHeader(responsedetails, header) {
    let isHeader = responsedetails.find(jsonarr => jsonarr.name.toLowerCase() == header);
    return isHeader ? isHeader.value : undefined;
}
function ugetContentDispFilename(content) {
    // Uget-Integrator's "uget-integrator.py" basename(unquote(data['FileName'])) replace the %xx escapes
    return (/filename\*?=./i).test(content)
        ? content.split(';', 2).pop().match(/(?<=filename\*?=["'\\]{0,2})(?:UTF-\d'{2})?([^"'\\]+\.\w{1,10})/i).pop() : '';
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
    return url ? new URL(url).origin : undefined;
}
function ugetStripHostname(url) {
    return url ? new URL(url).hostname : undefined;
}
function ugetDeleteListener() {
    return chrome.webRequest.onHeadersReceived.hasListener(ugetOnHeaderReceived)
        ? (chrome.webRequest.onHeadersReceived.removeListener(ugetOnHeaderReceived), clearMessage()) : undefined;
}
/**
 * Check whether or not to interrupt the given url.
 */
function isURLBlacklisted(url, originurl) {
    return ugetUrlsToSkip.includes(ugetStripHostname(url)) || ugetUrlsToSkip.includes(ugetStripHostname(originurl));
}
function IsURLWhitelisted(url, originurl) {
    return ugetUrlsToInterrupt.includes(ugetStripHostname(url)) || ugetUrlsToInterrupt.includes(ugetStripHostname(originurl));
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
    chrome.runtime.sendNativeMessage(ugetHostName, ugetMessage, function (response) {
        //clearMessage();
        ugetIntegratorNotFound = !response;
        if ((!ugetIntegratorNotFound && !ugetIntegratorVersion) || !ugetMessage.URL) {
            ugetIntegratorVersion = response.Version;
            //ugetVersion = response.Uget;
            changeIcon();
        }
    });
}
/**
 * Return the internal state.
 */
function ugetState() {
    return (ugetIntegratorNotFound || !ugetIntegratorVersion)
        ? 2 : !ugetIntegratorVersion.startsWith(UGET_REQ_INTEGRATOR_VERSION)
            ? 1 : 0;
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
 * Extract the POST parameters from a form data.
function postParams(source) {
    let array = [];
    for (let key in source) {
        array.push(encodeURIComponent(key) + '=' + encodeURIComponent(source[key]));
    }
    return array.join('&');
} */
/**
 * Get the file size of given URL.
 * @param {string} url
 */
// doesn't work with auth basic
// function ugetFetchPromise(url) {
//     Promise.all([fetch(url).then(response => response.headers)])
//         .then(([headResponse]) => {
//             ugetMessage.FileSize = parseInt(headResponse.get('content-length'));
//             ugetMessage.FileName = ugetContentDispFilename(headResponse.get('content-disposition'));
//         }).catch((_error) => {
//             ugetMessage.FileSize = UgetMinFsToInterrupt;
//             ugetMessage.FileName = '';
//         });
// }
/**
 * Parse the cookies and send the ugetMessage to the native host.
 */
function cookiesGetAll(url) {
    return chrome.cookies.getAll({ 'url': ugetRootURL(url) }, parseCookies);
}
function parseCookies(cookies_arr) {
    let cookies = '';
    if (cookies_arr) {
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
    ugetDeleteListener();
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
/**
 * Check the TAB URL and enable download_media_with_uget if the page is Youtube
 * @param {*int} tabId
 */
// function checkForYoutube(tabId, disableIfNot) {
//     chrome.tabs.get(tabId, function (tab) {
//         let isYoutube = tab['url'] && tab['url'].includes('/www.youtube.com/watch?v=')
//         if (isYoutube) {
//             chrome.contextMenus.update("download_media_with_uget", {
//                 enabled: true
//             });
//         } else if (disableIfNot) {
//             chrome.contextMenus.update("download_media_with_uget", {
//                 enabled: false
//             });
//         }
//     });
// }
/**
 * Grab videos and add them to ugetMediaInTab.
 */
// function enableVideoGrabber() {
//     chrome.tabs.onActivated.addListener(function (activeInfo) {
//         if (ugetMediaInTab[activeInfo['tabId']] != undefined) {
//             // Media already detected
//             chrome.contextMenus.update("download_media_with_uget", {
//                 enabled: true
//             });
//         } else {
//             // Check for Youtube
//             checkForYoutube(activeInfo['tabId'], true);
//         }
//     });
//     chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
//         if (ugetMediaInTab[tabId]) {
//             delete ugetMediaInTab[tabId];
//         }
//     });
//     chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
//         if (changeInfo['status'] === 'loading') {
//             // Loading a new page
//             delete ugetMediaInTab[tabId];
//         }
//         // Check for Youtube
//         checkForYoutube(tabId, false);
//     });
//     chrome.webRequest.onResponseStarted.addListener(function (details) {
//         let content_url = details['url'];
//         let type = details['type'];
//         if (type === 'media' || content_url.includes('mp4')) {
//             let tabId = details['tabId'];
//             let mediaSet = ugetMediaInTab[tabId];
//             if (mediaSet == undefined) {
//                 mediaSet = new Set();
//                 ugetMediaInTab[tabId] = mediaSet;
//             }
//             mediaSet.add(content_url);
//             chrome.contextMenus.update("download_media_with_uget", {
//                 enabled: true
//             });
//         }
//     }, {
//         urls: ['*://*/*'],
//         types: ['media', 'object']
//     });
// }
start();
