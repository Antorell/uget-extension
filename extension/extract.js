/*
 * uget-chrome-wrapper is an extension to integrate uGet Download manager
 * with Google Chrome, Chromium, Vivaldi and Opera in Linux and Windows.
 *
 * Copyright (C) 2017  Gobinath
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

extract();

function extract() {
    let txt = '';
    let urls = [];
    let url = '';
    for (let i = 0; i < document.links.length; i++) {
        if (document.links[i].href.match(/^(https?\:|ftp\:)/)) {
            if (document.links[i].href.split('/').pop().match(/^([^\^?^=^&])+(\.[a-zA-Z0-9]+)?$/)) {
                url = decodeURI(document.links[i].href);
            }
            if (urls.indexOf(url) < 0) {
                urls.push(url);
            }
        }
    }
    urls = urls.filter(Boolean);
    txt = urls.join('\n');

    if (txt !== '') {
        return { success: true, urls: txt };
    }
    return { success: false, urls: "" };
}
