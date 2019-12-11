//============================================
// BACKEND API
//============================================

var Quint = {};

Quint.Api = {};

Quint.Api.sendRequest = function (method, params, callback) {
    var params = {
        method: method,
        content: params
    }
    $.ajax({
        url: midasApiUrls.baseUrl + "quintApi",
        method: "POST",
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(params),
        success: function (data) {
            callback(undefined, data);
        },
        error: function (xhr, textStatus, e) {
            callback(e != null ? e : textStatus);
        }
    });
}

//============================================
// EXECUTORS
//============================================

Quint.Executors = {};

Quint.Executors.parallel = function (tasks, callback) {
    var nTasks = tasks.length;
    var results = [];

    for (var resultN = 0; resultN < nTasks; ++resultN) {
        results.push(null);
    }

    var finishedTaskN = 0;
    var callbackCalled = false;

    var finish = function (e) {
        if (!callbackCalled) {
            if (e != null) {
                console.error(e);
            }
            callbackCalled = true;
            callback(e, results);
        }
    }

    var executeTask = function (taskN) {
        var task = tasks[taskN];

        try {
            task(function (e, result) {
                if (e != null) return finish(e);

                results[taskN] = result;
                ++finishedTaskN;

                if (finishedTaskN >= nTasks) {
                    finish();
                }
            })
        } catch (e) {
            finish(e);
        }
    }

    for (var taskN = 0; taskN < nTasks; ++taskN) {
        executeTask(taskN);
    }
}

//============================================
// SEARCHPOINT
//============================================

Quint.SearchPoint = function (opts) {
    var self = this;

    if (opts.containerId == null) throw new Error('Parameter `containerId` missing!');
    if (opts.spId == null) throw new Error('Parameter `spId` missing!');
    if (opts.widgetW == null) throw new Error('Parameter `containerW` missing!');
    if (opts.widgetH == null) throw new Error('Parameter `containerH` missing!');
    if (opts.spPageSize == null) throw new Error('Parameter `spPageSize` missing!');
    if (opts.spTotalResults == null) throw new Error('Parameter `spTotalResults` missing!');

    self._containerId = opts.containerId;
    self._spId = opts.spId;
    self._widgetW = opts.widgetW;
    self._widgetH = opts.widgetH;
    self._spPageSize = opts.spPageSize;
    self._spTotalResults = opts.spTotalResults;

    self._measurements = {
        paddingTop: 10
    }
}

Quint.SearchPoint.prototype.init = function (opts, callback) {
    var self = this;
    var queryId = null;

    var containerId = self._containerId;
    var spId = self._spId;
    var widgetW = self._widgetW;
    var widgetH = self._widgetH;
    var spPageSize = self._spPageSize;
    var spTotalResults = self._spTotalResults;
    var query = opts.query;
    var ballPosition = opts.posX == null && opts.posY == null ? null : {
        x: opts.posX,
        y: opts.posY
    }

    var containerH = self._getContainerH();

    var spContainerId = containerId + '-' + spId;

    var container = $('#' + containerId);
    container.addClass('container-quint-widget');

    var wrapper = $('<div class="container" style="padding-top:' + self._measurements.paddingTop + 'px;height: calc(100% - ' + self._measurements.paddingTop + 'px);" />');
    var widgetWrapper = $('<div />');

    var inputContainer = $('<div class="div-input-wrapper form-group" />').appendTo(inputForm);

    var inputForm = $('<form />');
    var inputRow = $('<div class="row" />');

    var keywordWrapper = $('<div class="col-md-8" />');
    var keywordInput = $('<input type="text" class="form-control" />');
    var submitWrapper = $('<div class="col-md-4" />');
    var submitBtn = $('<button type="button" class="btn btn-primary">Search</button>');

    var widgetContainer = $('<div id="' + spContainerId + '" class="widget-container" style="width: ' + widgetW + 'px; height: ' + widgetH + 'px;" />');
    var itemsContainer = $('<div class="div-items-wrapper" style="overflow-y: auto;" />');

    keywordWrapper.append(keywordInput);
    submitWrapper.append(submitBtn);

    inputRow.append(keywordWrapper);
    inputRow.append(submitWrapper);

    inputForm.append(inputRow);

    inputContainer.append(inputForm);

    widgetWrapper.addClass('hidden');
    widgetWrapper.append(widgetContainer);
    widgetWrapper.append(itemsContainer);

    wrapper.append(inputForm);
    wrapper.append(widgetWrapper);
    container.append(wrapper);

    var inputH = inputContainer.height();

    itemsContainer.height(containerH - inputH - widgetH - self._measurements.paddingTop-40);

    var persistParams = function (params) {
        var widgetNumber = $('#' + containerId).data('itmnumber');
        var selectedWidget = $.grep(midasWidget.allWidgets, function (e) {
            return e.widgetNumber === widgetNumber;
        });

        if (typeof selectedWidget[0].widgetMeta.parameters === "string") {
            selectedWidget[0].widgetMeta.parameters = JSON.parse(selectedWidget[0].widgetMeta.parameters)
        }
        selectedWidget[0].widgetMeta.parameters = Object.assign(selectedWidget[0].widgetMeta.parameters, params);
    }

    var sp = SearchPoint({
        containerId: spContainerId,
        containerW: widgetW,
        containerH: widgetH,
        pageSize: spPageSize,
        drawItems: function (data, qid) {
            itemsContainer.html('');

            // store the query ID
            queryId = qid;

            // draw the items
            var items = data;

            if (items.length > 0) {
                itemsContainer.append('<div class="span-sample-notification">Showing a sample of 200 results.</div>')
            }

            for (var itemN = 0; itemN < items.length; ++itemN) {
                var item = items[itemN];

                var rank = item.rank;
                var title = item.title;
                var description = item.description.substring(0, 300);
                var displayUrl = item.displayURL;
                var url = item.URL;

                var itemwrapper = $('<article />');
                var titleDiv = $('<div class="item_title"><a href="' + url + '" target="_blank">(' + rank + ') ' + title + "</a></div>");
                var descDiv = $('<div class="sp-item-desc">' + description + "</div>");
                var urlLink = $('<a href="' + url + '" target="_blank" class="sp-item-url">' + displayUrl + "</a>");

                itemwrapper.append(titleDiv);
                itemwrapper.append(descDiv);
                itemwrapper.append(urlLink);

                itemsContainer.append(itemwrapper);
            }

            widgetWrapper.removeClass('hidden');
        },
        fetchItems: function (pos, page, callback) {
            var x = pos.x;
            var y = pos.y;

            persistParams({ posX: x, posY: y });

            var params = {
                method: 'rank',
                content: {
                    x: pos.x,
                    y: pos.y,
                    p: page,
                    qid: queryId
                }
            }
            Quint.Api.sendRequest('spRequest', params, function (e, data) {
                if (e != null) return callback(e);
                callback(undefined, data);
            });
        },
        fetchKeywords: function (pos, callback) {
            var params = {
                method: 'keywords',
                content: {
                    x: pos.x,
                    y: pos.y,
                    qid: queryId
                }
            }
            Quint.Api.sendRequest('spRequest', params, callback);
        }
    })

    var fetchResults = function (query, ballPosition) {
        midasMain.showWidgetLoading(true, containerId);
        persistParams({ query: query });

        var params = {
            method: 'query',
            content: {
                q: query,
                n: spTotalResults,
                c: 'kmeans'
            }
        }
        Quint.Api.sendRequest('spRequest', params, function (e, data) {
            // itemsContainer.removeClass('loading');
            midasMain.showWidgetLoading(false, containerId);

            if (e != null) {
                alert(e.message);   // TODO handle somehow
                console.error(e);
            }

            // $('#' + containerId).removeClass('hidden');
            sp.setWidget(data);

            if (ballPosition != null) {
                sp.reposition(ballPosition);
            }
        });

        keywordInput.val(query);
    }

    if (query !== null) {
        fetchResults(query, ballPosition);
    }

    submitBtn.click(function () {
        //itemsContainer.addClass('loading');
        var query = keywordInput.val();
        fetchResults(query);
    })
    {
        let stopPropagation = function (event) {
            event.stopPropagation();
            if (event.cancelBubble != null) { event.cancelBubble = true;  }
            return false;
        }

        keywordInput.keypress(function (e) {
            if (e.which != 13) { return; }
            return stopPropagation(e);
        })
        keywordInput.keyup(function (e) {
            if (e.which != 13) { return; }

            var query = keywordInput.val();
            fetchResults(query);
            return stopPropagation(e);
        })
        keywordInput.keydown(function (e) {
            if (e.which != 13) { return; }
            return stopPropagation(e);
        })
    }

    self._sp = sp;

    callback();
}

Quint.SearchPoint.prototype.resize = function (width, height) {
    var self = this;

    var sp = self._sp;

    var containerId = self._containerId;
    var container = $('#' + containerId);
    var spContainer = container.find('.widget-container');

    var containerH = self._getContainerH();
    var containerW = self._getContainerW();

    // redraw searchpoint
    var spWidth = self._widgetW;
    var spHeight = self._widgetH;
    var containerPadding = 30;   // measured in Chrome

    if (spWidth > containerW - containerPadding) { 
        // resize searchpoint
        spWidth = containerW - containerPadding;
        spHeight = spWidth;
    }

    spContainer.css('width', spWidth);
    spContainer.css('height', spWidth);
    spContainer.children('canvas').css('width', spWidth);
    spContainer.children('canvas').css('height', spHeight);

    sp.setSize(spWidth, spHeight);


    // redraw the items
    var widgetW = spWidth;
    var widgetH = self._widgetH;
    var inputH = container.find('.div-input-wrapper').height();
    var offsetTop = inputH + widgetH + self._measurements.paddingTop+40;


    var newItemsH = Math.max(0, containerH - offsetTop);

    //var widgetContainer = $('#' + self._containerId + '-' + self._spId);
    var itemsContainer = container.find('.div-items-wrapper');
    itemsContainer.height(newItemsH);
}

Quint.SearchPoint.prototype._getContainerW = function () {
    var self = this;
    var container = $('#' + self._containerId);
    return container.parent().width();
}

Quint.SearchPoint.prototype._getContainerH = function () {
    var self = this;
    var container = $('#' + self._containerId);
    return container.parent().height();
}

//============================================
// ER NEWS
//============================================

Quint.ErNews = function (opts) {
    var self = this;

    if (opts.containerId == null) { throw new Error('Parameter `containerId` missing!'); }

    self._containerId = opts.containerId;

    self._container = null;
    self._itemsContainer = null;

    self._measurements = {
        paddingTop: 10
    }
    self._configLinks = {
        'er-1': 'http://news.qmidas.quintelligence.com/monitoring?uri=4c851c58-0d7c-434c-8f7c-ba4cb6390ad1&articlesSortBy=fq&auth=oq3a1uD33T',
        'er-2': 'http://news.qmidas.quintelligence.com/monitoring?uri=326d51b4-e7b8-4706-908c-4710c0bf4b2b&articlesSortBy=fq&auth=oq3a1uD33T',
        'er-3': 'http://news.qmidas.quintelligence.com/monitoring?uri=a5031e80-c79d-445b-a4ed-3c891216fffd&articlesSortBy=fq&auth=oq3a1uD33T',
        'er-4': 'http://news.qmidas.quintelligence.com/monitoring?uri=e6007fa5-bb5c-4051-bdb7-365531c47008&articlesSortBy=fq&auth=oq3a1uD33T',
        'er-5': 'http://news.qmidas.quintelligence.com/monitoring?uri=4d76c325-e8cd-40bd-b66b-4fa07c3cc26a&articlesSortBy=fq&auth=oq3a1uD33T'
    }
}

Quint.ErNews.prototype.init = function (opts, callback) {
    var self = this;

    var containerId = self._containerId;
    var configLinkMap = self._configLinks;

    var topicKey = opts.topicKey;

    // if (topicKey == null) { topicKey = 'er-1'; }
    var persistParams = function (params) {
        var widgetNumber = $('#' + containerId).data('itmnumber');
        var selectedWidget = $.grep(midasWidget.allWidgets, function (e) {
            return e.widgetNumber === widgetNumber;
        });

        if (typeof selectedWidget[0].widgetMeta.parameters === "string") {
            selectedWidget[0].widgetMeta.parameters = JSON.parse(selectedWidget[0].widgetMeta.parameters)
        }
        selectedWidget[0].widgetMeta.parameters = Object.assign(selectedWidget[0].widgetMeta.parameters, params);
    }

    // create the UI
    var container = $('#' + containerId);
    container.addClass('container-quint-widget');

    var wrapper = $('<div class="container" style="padding-top:' + self._measurements.paddingTop + 'px;height: calc(100% - ' + self._measurements.paddingTop + 'px);" />');

    var widgetWrapper = $('<div class="widget-wrapper" />');

    var inputForm = $('<form />');
    var inputRow = $('<div class="form-row" />');
    var inputContainer = $('<div class="div-input-wrapper form-group col-md-10" />');
    var keywordsContainer = $('<div class="div-keywords-wrapper" />');
    var itemsContainer = $('<div class="div-items-wrapper" style="overflow-y: auto;" />');

    var input = $('<select class="er-topic-select form-control" />');

    var addOption = function (value, label) {
        var option = $('<option value="' + value + '">' + label + '</option>');
        if (value == topicKey) { option.attr('selected', 'selected'); }
        input.append(option);
    }
    var hideDefaultOption = function () {
        defaultOption.css('display', 'none');
    }

    var defaultOption = $('<option disabled selected value>Choose topic</option>');
    input.append(defaultOption);

    addOption('er-1', 'MIDAS');
    addOption('er-2', 'EUS');
    addOption('er-3', 'FIN');
    addOption('er-4', 'IRE');
    addOption('er-5', 'NIR');

    if (topicKey != null) { hideDefaultOption(); }

    var configureWrapper = $('<div class="form-group col-md-2" />');
    var configureLink = $('<a href="#" role="button" class="btn btn-primary" target="_blank">Configure</a>');

    configureWrapper.append(configureLink);

    // assemble the UI
    inputContainer.append(input);

    inputRow.append(inputContainer);
    inputRow.append(configureWrapper);

    // inputContainer.append(configureWrapper);

    inputForm.append(inputRow);

    widgetWrapper.append(keywordsContainer);
    widgetWrapper.append(itemsContainer);

    wrapper.append(inputForm);
    wrapper.append(widgetWrapper);

    container.append(wrapper);

    self._container = container;
    self._itemsContainer = itemsContainer;

    let refreshResults = function () {
        var topicKey = input.find(':selected').val();

        var configLink = configLinkMap[topicKey];
        configureLink.attr('href', configLink);

        persistParams({ topicKey: topicKey });

        self._fetchResults(topicKey, function (e, data) {
            if (e != null) return callback(e);

            var articles = data.articles;
            var keywords = data.keywords;

            var tasks = [
                function (xcb) {
                    self._renderArticles(articles, xcb);
                },
                function (xcb) {
                    self._renderKeywords(keywords, xcb);
                }
            ]

            Quint.Executors.parallel(tasks, callback)
        });
    }

    // draw the results
    input.change(function () {
        hideDefaultOption();
        refreshResults();
    })

    // fetch the initial results
    refreshResults();
}

Quint.ErNews.prototype.resize = function (width, height) {

}

Quint.ErNews.prototype._renderArticles = function (articles, callback) {
    var self = this;

    var itemsContainer = self._itemsContainer;
    itemsContainer.html('');

    for (var itemN = 0; itemN < articles.length; ++itemN) {
        var article = articles[itemN];

        var title = article.title;
        var description = article.content;
        var url = article.url;
        var displayUrl = article.displayUrl;

        var itemWrapper = $('<article />');
        var titleDiv = $('<div class="item_title"><a href="' + url + '" target="_blank"> ' + title + "</a></div>");
        var descDiv = $('<div class="sp-item-desc">' + description + "</div>");
        var urlLink = $('<a href="' + url + '" target="_blank" class="sp-item-url">' + displayUrl + "</a>");

        itemWrapper.append(titleDiv);
        itemWrapper.append(descDiv);
        itemWrapper.append(urlLink);

        itemsContainer.append(itemWrapper);
    }

    callback();
}

Quint.ErNews.prototype._renderKeywords = function (keywords, callback) {
    var self = this;

    var container = self._container;
    var keywordsContainer = container.find('.div-keywords-wrapper');

    var kwWrapper = $('<div class="keywords-wrapper" />')

    keywordsContainer.html('');
    keywordsContainer.append(kwWrapper);

    var maxWeight = 0;
    var minWeight = 1;

    for (var kwN = 0; kwN < keywords.length; ++kwN) {
        var keyword = keywords[kwN];

        if (keyword.weight > maxWeight) { maxWeight = keyword.weight; }
        if (keyword.weight < minWeight) { minWeight = keyword.weight; }
    }

    var transformed = [];
    for (var kwN = 0; kwN < keywords.length; ++kwN) {
        var keyword = keywords[kwN];

        var weight = (keyword.weight - minWeight) / (maxWeight - minWeight);

        transformed.push({
            text: keyword.keyword,
            weight: weight
        })
    }

    kwWrapper.jQCloud(transformed, {
        autoResize: true,
        colors: ["#800026", "#bd0026", "#e31a1c", "#fc4e2a", "#fd8d3c", "#feb24c", "#fed976"],
        // shape: 'rectangular'
    });

    callback();
}

Quint.ErNews.prototype._fetchResults = function (topicKey, callback) {
    var self = this;

    var containerId = self._containerId;
    var container = self._container;

    midasMain.showWidgetLoading(true, containerId);

    ////===============Save query to the widget meta data to reload the widget in saved dashboard without rentering the query=============//
    var widgetNumber = $('#' + containerId).data('itmnumber');
    var selectedWidget = $.grep(midasWidget.allWidgets, function (e) {
       return e.widgetNumber === widgetNumber;
    });

    var params = selectedWidget[0].widgetMeta.parameters;
    if (typeof params === "string") {
       params = JSON.parse(params);
    }
    params.topicKey = topicKey;
    ////==========================================END================================================//

    var tasks = [
        function (xcb) {
            self._fetchArticles(topicKey, xcb);
        },
        function (xcb) {
            self._fetchKeywords(topicKey, xcb);
        }
    ]

    Quint.Executors.parallel(tasks, function (e, results) {
        midasMain.showWidgetLoading(false, containerId);

        if (e != null) return callback(e);

        callback(undefined, {
            articles: results[0],
            keywords: results[1]
        })
    })

}

Quint.ErNews.prototype._fetchArticles = function (topicKey, callback) {
    var params = {
        method: 'article',
        content: {
            topic: topicKey,
            params: {
                action: 'getArticlesForTopicPage',
            }
        }
    }

    Quint.Api.sendRequest('erRequest', params, function (e, data) {
        if (e != null) return callback(e);

        var articles = data.articles.results;

        var results = [];
        for (var articleN = 0; articleN < articles.length; ++articleN) {
            var article = articles[articleN];

            var title = article.title;
            var content = article.body;
            var url = article.url;
            var displayUrl = article.source.uri;

            if (content.length > 255) {
                content = content.substring(0, 252) + '...';
            }

            results.push({
                title: title,
                content: content,
                url: url,
                displayUrl: displayUrl
            })
        }

        callback(undefined, results);
    })
}

Quint.ErNews.prototype._fetchKeywords = function (topicKey, callback) {
    var params = {
        method: 'article',
        content: {
            topic: topicKey,
            params: {
                action: 'getArticlesForTopicPage',
                resultType: 'keywordAggr',
                keywordAggrSampleSize: 1000
            }
        }
    }

    Quint.Api.sendRequest('erRequest', params, function (e, data) {
        if (e != null) return callback(e);

        var keywords = data.keywordAggr.results;

        callback(undefined, keywords);
    })
}

Quint.ErNews.prototype._onInputChanged = function (val, callback) {
    alert('new input: ' + val);
}

Quint.ErNews.prototype._handleError = function (e) {
    console.error('Exception in ErNews!');
    console.error(e);
    alert(e.message);
}
