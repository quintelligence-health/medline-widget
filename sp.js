function SearchPoint(opts) {
    if (opts.containerId == null) throw new Error('Parameter `containerId` missing!');
    if (opts.containerW == null) throw new Error('Parameter `containerW` missing!');
    if (opts.containerH == null) throw new Error('Parameter `containerH` missing!');
    if (opts.pageSize == null) throw new Error('Parameter `pageSize` missing!');
    if (opts.drawItems == null) throw new Error('Parameter `drawItems` missing!');
    if (opts.fetchItems == null) throw new Error('Parameter `fetchItems` missing!');
    if (opts.fetchKeywords == null) throw new Error('Parameter `fetchKeywords` missing!');

    var containerId = opts.containerId;
    var stageW = opts.containerW;
    var stageH = opts.containerH;
    var pageSize = opts.pageSize;
    var itemDrawFun = opts.drawItems;
    var fetchItemsFun = opts.fetchItems;
    var fetchKeywordsFun = opts.fetchKeywords;

    var listCont = null;
    var service = null;
    var stages = null;

    var items = [];
    var queryId = null;
    var nItems = 0;

    // var minKwSize = 8;
    // var maxKwSize = 12;
    var minKwSize = 10;
    var maxKwSize = 16;

    var centerClustColor = [212,0,90];  // light gray

    function getClusteringKey() {
        return 'kmeans';
    }

    function setClusteringKey(key) {
        $('#clustering_fld').val(key);
    }

    function getNResults() {
        var val = $('#spn-nresults').val();

        return val != null ? val : 200;
    }

    /**
     * A task executor which always executes only the last task in the queue (if
     * tasks are piling up, the middle ones are forgotten).
     */
    var executeLastExecutor = function () {
        var currTask = null;
        var pendingTask = null;
        var pendingCancelCb = null;

        var executeCurrTask = function () {
            if (currTask == null) return;
            currTask(function () {
                // finished the current task, now execute whichever task is pending
                currTask = pendingTask;
                pendingTask = null;
                executeCurrTask();
            })
        }

        return function execute(task, cancelCb) {
            if (currTask == null) {
                currTask = task;
                executeCurrTask();
            } else {
                if (pendingTask != null) {
                    pendingCancelCb();
                }
                pendingTask = task;
                pendingCancelCb = cancelCb != null ? cancelCb : function () {};
            }
        }
    }

    // EXECUTORS
    var fetchItemsExecutor = executeLastExecutor();
    var fetchKeywordsExecutor = executeLastExecutor();

    // point
    var Point = function (x, y) {
        return {
            x: x,
            y: y
        }
    }

    function createWc(words, centerX, centerY, scale) {

        var n = words.length;
        var placed = [];

        scale = scale == null ? 1 : scale;

        // map weights to range [0, 1]
        var maxWgt = -1;
        for (var i = 0; i < words.length; i++) {
            if (words[i].weight > maxWgt)
                maxWgt = words[i].weight;
        }

        for (var i = 0; i < words.length; i++) {
            words[i].weight /= maxWgt;
        }

        // calc word sizes and max area
        var maxArea = -1;
        for (var i = 0; i < n; i++) {
            var word = words[i];
            word.height = Math.ceil(getWordH(word)*scale);
            word.width = getWordW(word);

            if (word.width * word.height > maxArea)
                maxArea = word.width * word.height;
        }

        // calc new weights by area
        for (var i = 0; i < n; i++) {
            words[i].newWgt = (words[i].width * words[i].height) / maxArea;
        }

        // sort the words by weight
        words.sort(function (w0, w1) {
            return w1.newWgt - w0.newWgt;
        });

        // required functions
        function intersects(word0, word1) {
            return Math.abs(word0.pos[1] - word1.pos[1]) <= (word0.height + word1.height) / 2 &&
                Math.abs(word0.pos[0] - word1.pos[0]) <= (word0.width + word1.width) / 2;
        }

        function intersectsPlaced(word) {
            for (var i = 0; i < placed.length; i++) {
                if (intersects(word, placed[i]))
                    return true;
            }
            return false;
        }

        // place the words
        var rstep = 3.0;
        var astep = .1;
        for (var i = 0; i < n; i++) {
            var word = words[i];

            var angle = 2*Math.PI * Math.random();
            var radius = 0;
            var dir = (i % 2)*2 - 1;

            word.pos = [centerX, centerY];
            var isPlaced = false;
            while (!isPlaced) {
                for (var addAngle = 0; addAngle < 2*Math.PI; addAngle += astep) {
                    var alpha = dir*(angle + addAngle);
                    word.pos[0] = centerX + radius*Math.cos(alpha);
                    word.pos[1] = centerY + radius*Math.sin(alpha);

                    if (!intersectsPlaced(word)) {
                        isPlaced = true;
                        break;
                    }
                }
                radius += rstep;
            }
            placed.push(word);
        }
    }

    function getWordH(word) {
        return Math.max(minKwSize, word.fq * maxKwSize);
    }

    function getWordW(word) {
        var ctx = stages[0].layers[1].getContext();
        ctx.font = word.height + 'pt GroteskDS75';
        var metrics = ctx.measureText(word.text);
        return metrics.width;
    }

    var ListController = function () {
        var that = {
            currPage: 0,
            perPage: pageSize,

            drawPageLink: function (page) {
                if (page == that.currPage + 1)
                    return "<td><strong>" + page + "</strong></td>";
                else
                    return "<td><a onclick='return service.jumpPage(" + (page-1) + ");'>" + page + "</a></td>";
            },

            drawPageLinks: function () {
                var navig = document.getElementById("nav");

                if (nItems > 0) {
                    var nPages = Math.ceil(nItems / that.perPage);

                    var navigHTML = "<table id='navigation_table'><tr>";

                    if (that.currPage > 0)
                        navigHTML += "<td><a onclick='return service.prevPage()'>&lt;&lt;</a></td>";

                    navigHTML += that.drawPageLink(1);

                    if (that.currPage < 3) {
                        for (var i = 2; i <= 5 && i < nItems; i++)
                            navigHTML += that.drawPageLink(i);
                    } else if (that.currPage > nPages - 3) {
                        if (that.currPage > 3)
                            navigHTML += "<td>...</td>";

                        for (var i = nPages - 4; i < nPages; i++)
                            navigHTML += that.drawPageLink(i);
                    } else {
                        if (that.currPage > 3)
                            navigHTML += "<td>...</td>";

                        for (var i = that.currPage - 1; i <= that.currPage + 3 && i < nPages; i++)
                            navigHTML += that.drawPageLink(i);
                    }

                    if (that.currPage < nPages - 4)
                        navigHTML += "<td>...</td>";

                    navigHTML += that.drawPageLink(nPages);

                    if (that.currPage < nPages - 1)
                        navigHTML += "<td><a onclick='return service.nextPage()'>&gt;&gt;</a></td>";

                    navigHTML += "</tr></table>";
                    navig.innerHTML = navigHTML;
                }
            },

            drawItems: function () {
                itemDrawFun(items, queryId);
                return false;
            }
        };
        return that;
    };

    var DataService = function () {

        var that = {
            onData: function (data) {
                items = data.items;
                queryId = data.queryId;
                nItems = data.totalItems;
                listCont.currPage = 0;

                var nStages = 1; // worldRankingDisabled() ? 3 : 2;

                // update the stages
                for (var i = 0; i < nStages; i++) {
                    var stage = stages[i];
                    var clusters = data.clusters[i];// [0];

                    if (stage.removeTooltips)
                        stage.removeTooltips();

                    if (clusters != null && clusters.length > 0) {
                        stage.origClusters = clusters;
                        that.toClientCoords(stage.origClusters);

                        var nClusters = clusters.length;
                        stage.clusterColors = [];
                        var step = 2*Math.PI / nClusters;
                        for (var colorN = 0; colorN < nClusters; ++colorN) {
                            var angle = colorN*step*360 / (2*Math.PI);
                            stage.clusterColors.push([angle.toFixed(), 80, 40]);
                        }

                        if (getClusteringKey() == 'kmeans') {
                            var nClusts = clusters.length - 1;

                            for (var clustIdx = 0; clustIdx < nClusts; clustIdx++) {
                                var cluster = clusters[clustIdx];

                                // normalize keyword frequencies
                                var maxFq = -1;
                                for (var kwIdx = 0; kwIdx < cluster.kwords.length; kwIdx++) {
                                    if (cluster.kwords[kwIdx].fq > maxFq)
                                        maxFq = cluster.kwords[kwIdx].fq;
                                }
                                for (var kwIdx = 0; kwIdx < cluster.kwords.length; kwIdx++)
                                    cluster.kwords[kwIdx].fq /= maxFq;

                                createWc(cluster.kwords, cluster.x, cluster.y);
                            }

                            var centerClust = clusters[nClusts];
                            centerClust.color = centerClustColor;

                            // normalize keyword frequencies
                            var maxFq = -1;
                            for (var kwIdx = 0; kwIdx < centerClust.kwords.length; kwIdx++) {
                                if (centerClust.kwords[kwIdx].fq > maxFq)
                                    maxFq = centerClust.kwords[kwIdx].fq;
                            }
                            for (var kwIdx = 0; kwIdx < centerClust.kwords.length; kwIdx++)
                                centerClust.kwords[kwIdx].fq /= maxFq;

                            createWc(centerClust.kwords, centerClust.x, centerClust.y, 1.3);
                        } else {
                            $.each(clusters, function (idx, cluster) {
                                createWc(cluster.kwords, cluster.x, cluster.y);

                                // normalize keyword frequencies
                                var maxFq = -1;
                                for (var kwIdx = 0; kwIdx < cluster.kwords.length; kwIdx++) {
                                    if (cluster.kwords[kwIdx].fq > maxFq)
                                        maxFq = cluster.kwords[kwIdx].fq;
                                }
                                for (var kwIdx = 0; kwIdx < cluster.kwords.length; kwIdx++)
                                    cluster.kwords[kwIdx].fq /= maxFq;
                            });
                        }

                        stage.refresh();
                    }
                }

                // refresh the items
                listCont.drawItems();

                return false;
            },

            fetchItems: function (page) {
                fetchItemsExecutor(function (done) {
                    var stage = stages[0];
                    var pos = stage.getTargetPosition();

                    var x = pos.x != Number.POSITIVE_INFINITY ? pos.x + stage.target.width / 2 : pos.x;
                    var y = pos.y != Number.POSITIVE_INFINITY ? pos.y + stage.target.height / 2 : pos.y;

                    var serverPos = stage.toServerCoords(x, y);

                    fetchItemsFun(serverPos, page, function (e, data) {
                        if (e != null) {
                            console.error(e);
                            return done();
                        }

                        listCont.currPage = page;
                        items = data;
                        listCont.drawItems();
                        done();
                    });
                });
            },

            fetchKeywords: function (x, y, callback) {
                if (getClusteringKey() != 'kmeans') return;

                var task = function (done) {
                    var stage = stages[0];
                    var serverPos = stage.toServerCoords(x, y);

                    fetchKeywordsFun(serverPos, function (e, data) {
                        if (e != null) {
                            console.error(e);
                            return done();
                        }

                        callback(data);
                        done();
                    })
                }

                fetchKeywordsExecutor(task);
            },

            changePosition: function () {
                var page = listCont.currPage;
                that.fetchItems(page);
            },

            //transforms server coordinates to client coordinates
            toClientCoords: function (clustV) {
                var minX = stageW / 4;
                var minY = stageH / 4;
                var maxX = 3 * stageW / 4;
                var maxY = 3 * stageH / 4;

                var dx = maxX - minX;
                var dy = maxY - minY;

                for (var i = 0; i < clustV.length; i++) {
                    var clust = clustV[i];
                    clust.x = minX + dx * clust.x;
                    clust.y = minY + dy * clust.y;
                }
            }
        };

        return that;
    }

    // a history object
    var History = function (options) {
        var that = {
            stage: options.stage,
            hist: [],
            future: [],
            current: null,

            addItem: function (item) {
                that.hist.push(this.current);
                that.future = [];
                that.checkEmpty();
                that.current = item;
            },

            getPrevious: function () {
                if (that.hist.length > 0) {
                    var item = this.hist.pop();
                    that.future.push(this.current);
                    that.current = item;
                    that.checkEmpty();
                    return item;
                } else
                    return null;
            },

            getNext: function () {
                if (that.future.length > 0) {
                    var item = that.future.pop();
                    that.hist.push(that.current);
                    that.current = item;
                    that.checkEmpty();
                    return item;
                } else return null;
            },

            checkEmpty: function () {
                var stage = that.stage;
                if (that.future.length == 0 && stage.forward != null)
                    stage.forward.hide();
                else if (stage.forward != null)
                    stage.forward.show();
                if (that.hist.length == 0 && stage.back != null)
                    stage.back.hide();
                else if (stage.back != null)
                    stage.back.show();

                stage.drawProps();
            },

            clear: function () {
                that.hist = [];
                that.future = [];
                that.current = null;
                that.checkEmpty();
            }
        }

        return that;
    }

    function tooltip() {
        var id = 'tt';
        var top = 3;
        var left = 3;
        var maxw = 300;
        var speed = 80;
        var timer = 20;
        var delay = 0;
        var endalpha = 80;
        var alpha = 0;
        var tt, t, c, b, h;
        var ie = document.all ? true : false;

        var showTimer = null;

        var that = {
            show : function(v, w, x, y) {
                if (tt == null) {
                    tt = document.createElement('div');
                    tt.setAttribute('id', id);
                    t = document.createElement('div');
                    t.setAttribute('id', id + 'top');
                    c = document.createElement('div');
                    c.setAttribute('id', id + 'cont');
                    b = document.createElement('div');
                    b.setAttribute('id', id + 'bot');
                    tt.appendChild(t);
                    tt.appendChild(c);
                    tt.appendChild(b);
                    document.body.appendChild(tt);
                    tt.style.opacity = 0;
                    tt.style.filter = 'alpha(opacity=0)';
                    document.onmousemove = this.pos;
                }
                tt.style.display = 'block';
                c.innerHTML = v;
                tt.style.width = w ? w + 'px' : 'auto';
                if (!w && ie) {
                    t.style.display = 'none';
                    b.style.display = 'none';
                    tt.style.width = tt.offsetWidth;
                    t.style.display = 'block';
                    b.style.display = 'block';
                }
                if (tt.offsetWidth > maxw) {
                    tt.style.width = maxw + 'px';
                }
                h = parseInt(tt.offsetHeight) + top;

                that.pos(x,y);

                clearInterval(tt.timer);
                clearTimeout(showTimer);
                showTimer = setTimeout(function () {
                    tt.timer = setInterval(function() {
                        that.fade(1);
                    }, timer);
                }, delay);
            },
            pos : function(x, y) {
                $(tt).offset({top: y - $(tt).height() - 20, left: x});
                //tt.style.top = y + 'px';
                //tt.style.left = x + 'px';
            },
            fade : function(d) {
                var a = alpha;
                if ((a != endalpha && d == 1) || (a != 0 && d == -1)) {
                    var i = speed;
                    if (endalpha - a < speed && d == 1) {
                        i = endalpha - a;
                    } else if (alpha < speed && d == -1) {
                        i = a;
                    }
                    alpha = a + (i * d);
                    tt.style.opacity = alpha * .01;
                    tt.style.filter = 'alpha(opacity=' + alpha + ')';
                } else {
                    clearInterval(tt.timer);
                    if (d == -1) {
                        tt.style.display = 'none';
                    }
                }
            },
            hide : function() {
                clearTimeout(showTimer);
                if (tt != null) {
                    clearInterval(tt.timer);
                    tt.timer = setInterval(function() {
                        that.fade(-1);
                    }, timer);
                }
            }
        };

        return that;
    }


    //the ball which is dragged
    function Target(options) {
        var ie = document.all ? true : false;

        var img = new Image();
        img.src = "scripts/quint/img/ball.png";

        var ttip = tooltip();
        var tooltipVisible = false;

        function fetchKeywords(event) {
            service.fetchKeywords(that.getX() + that.prop.width/2, that.getY() + that.prop.height/2, function (data) {
                if (!tooltipVisible)
                    return;

                var offset = $(stages[0].stage.container).offset();

                var x = that.getX() + that.width + offset.left;
                var y = that.getY() + offset.top;

                ttip.show(data.join(', '), null, x, y);
            });
        }

        function showTooltip(event, delay) {
            tooltipVisible = true;

            delay = delay == null ? 500 : delay;

            if (delay > 0) {
                that.timer1 = window.setTimeout(function () {
                    fetchKeywords(event);
                }, delay);
            } else {
                fetchKeywords(event);
            }
        }

        function hideTooltip() {
            tooltipVisible = false;
            if (that.timer1 != null) {
                window.clearTimeout(that.timer1);
                that.timer1 = null;
                ttip.hide();
            }
        }

        var that = {
            stage: options.stage,
            dragging: false,
            prop: null,

            addHandlers: function () {
                var prop = that.prop;

                prop.on("mouseover", function (event) {
                    document.body.style.cursor = "pointer";

                    showTooltip(event);
                });
                prop.on("mouseout", function () {
                    document.body.style.cursor = "default";

                    hideTooltip();
                });
                prop.on("mousemove", function (event) {
                    hideTooltip();
                    showTooltip(event);
                    return false;
                });

                prop.on("dragstart", function () {
                    that.hideTooltip();
                    document.body.style.cursor = "move";
                    if (that.stage.hideTooltips)
                        that.stage.hideTooltips();
                });
                prop.on("dragend", function () {
                    that.stage.history.addItem(Point(that.getX(), that.getY()));
                    that.updatePosition(that.getX(), that.getY());
                    document.body.style.cursor = "pointer";
                });
                prop.on("dragmove", function (event) {
                    if (that.timer == null) {
                        that.timer = window.setTimeout(function () {
                            that.stage.target.updatePos();
                        }, 333);
                    }

                    var offset = $(stages[0].stage.container).offset();

                    var x = that.getX() + that.width + offset.left;
                    var y = that.getY() + offset.top;

                    ttip.pos(x, y);
                    showTooltip(event, 0);
                    return false;
                });
            },

            //send an AJAX request to the server
            updatePos: function () {
                if (that.timer != null) {
                    clearTimeout(that.timer);
                    that.timer = null;
                }
                that.fetch();
            },

            //send an AJAX request to the server with the current position
            fetch: function () {
                service.changePosition();
            },

            //updates the position and sends an AJAX request to the server
            updatePosition: function (x, y, fetchData) {
                if (fetchData == null) { fetchData = true; }

                that.setPosition(x, y);
                //create an AJAX request to the server
                if (fetchData) {
                    that.fetch();
                }
            },

            hideTooltip: function () {
                if (that.tooltip != null && that.tooltip.visible) {
                    that.tooltip.hide();
                    that.stage.remove(that.tooltip, that.stage.layers[0]);
                    that.stage.drawTarget();
                }
            },

            setPosition: function (x, y) {
                that.prop.x = x;
                that.prop.y = y;
                that.stage.drawTarget();
            },

            getX: function () {
                return that.prop.x;
            },

            getY: function () {
                return that.prop.y;
            },

            isDragging: function () {
                return that.prop == null ? false : that.prop.isDragging();
            }
        }

        img.onload = function () {
            var prop = new Kinetic.Image({
                image: img,
                x: (that.stage.width - img.width) / 2,
                y: (that.stage.height - img.height) / 2,
                width: img.width,
                height: img.height,
                draggable: true
            });

            var cloudImg = new Image();
            cloudImg.src = "scripts/quint/img/sugg.png";
            cloudImg.onload = function () {
                var tooltip = new Kinetic.Image({
                    image: cloudImg,
                    x: that.getX() + that.width,
                    y: that.getY() - cloudImg.height
                });

                that.tooltip = tooltip;
                that.stage.addTarget(tooltip);
                that.stage.drawTarget();
            };

            that.width = prop.width;
            that.height = prop.height;
            that.prop = prop;

            that.addHandlers();

            if (that.stage.history != null)
                that.stage.history.current = Point(that.getX(), that.getY());
            that.stage.addTarget(prop);
            that.stage.drawTarget();
        }

        return that;
    }

    //a cluster object
    function Cluster(options) {
        var font = "8pt GroteskDS75";
        var textColor = "#000000";

        function hsl2rgb(h, s, l) {
            var m1, m2, hue;
            var r, g, b;
            s /=100;
            l /= 100;
            if (s == 0)
                r = g = b = (l * 255);
            else {
                if (l <= 0.5)
                    m2 = l * (s + 1);
                else
                    m2 = l + s - l * s;
                m1 = l * 2 - m2;
                hue = h / 360;
                r = HueToRgb(m1, m2, hue + 1/3);
                g = HueToRgb(m1, m2, hue);
                b = HueToRgb(m1, m2, hue - 1/3);
            }
            return {r: Math.floor(r), g: Math.floor(g), b: Math.floor(b)};
        }

        function HueToRgb(m1, m2, hue) {
            var v;
            if (hue < 0)
                hue += 1;
            else if (hue > 1)
                hue -= 1;

            if (6 * hue < 1)
                v = m1 + (m2 - m1) * hue * 6;
            else if (2 * hue < 1)
                v = m2;
            else if (3 * hue < 2)
                v = m1 + (m2 - m1) * (2/3 - hue) * 6;
            else
                v = m1;

            return 255 * v;
        }

        var that = {
            stage: options.stage,
            text: options.text,
            radius: options.radius,
            idx: options.clustIdx,
            position: options.pos,
            kwords: options.kwords,

            prop: new Kinetic.Shape({
                drawFunc: function () {
                    var context = this.getContext();

                    var pos = that.position;

                    if (that.kwords != null && that.kwords.length > 0) {
                        // the updated visualization
                        // draw a tag cloud
                        $.each(that.kwords, function (idx, kword) {
                            var text = kword.text;
                            var size = kword.height;

                            context.font = size + 'px GroteskDS75';
                            context.textAlign = 'center';
                            context.textBaseline = 'middle';

                            //context.fillStyle = options.color;
                            if (options.colorPredefined) {
                                var color = hsl2rgb(options.color[0], options.color[1], options.color[2]);
                                context.fillStyle = 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
                            } else {
                                var sat = Math.sqrt(kword.weight)*100;
                                options.color[1] = sat;
                                var color = hsl2rgb(options.color[0], options.color[1], options.color[2]);
                                context.fillStyle = 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
                            }

                            context.fillText(text, kword.pos[0], kword.pos[1]);
                        });
                    } else {
                        //first draw the fading circle
                        var color = hsl2rgb(options.color[0], options.color[1], options.color[2]);
                        var gradient = context.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, that.radius);
                        gradient.addColorStop(0, 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')');
                        gradient.addColorStop(1, 'rgba(255,255,255, 0)');

                        context.beginPath();
                        context.arc(pos.x, pos.y, that.radius, 0, Math.PI * 2, true);
                        context.fillStyle = gradient;
                        context.fill();

                        //drawing the text
                        context.font = font;
                        context.fillStyle = textColor;
                        context.textAlign = "center";
                        context.fillText(that.text, that.position.x, that.position.y);
                    }
                }
            }),

            addHandlers: function () {
                var prop = that.prop;

                //add handlers to hide/show the tooltip
                prop.on("mouseover", function () {
                    document.body.style.cursor = "pointer";
                    that.tooltipTimer = window.setTimeout(function () {
                        that.stage.showClustTooltip(that.idx);
                    }, 1000);
                });

                prop.on("mouseout", function () {
                    clearTimeout(that.tooltipTimer);

                    if (that.stage.target.isDragging())
                        return;

                    document.body.style.cursor = "default";
                    that.tooltip.hide();
                    that.stage.drawActors();
                });

                prop.on("touchstart", function () {
                    var tooltip = that.tooltip;
                    if (tooltip.hidden == null || tooltip.hidden) {
                        tooltip.hidden = false;
                        that.stage.showClustTooltip(that.idx);
                    } else {
                        tooltip.hidden = true;
                        tooltip.hide();
                        that.stage.drawActors();
                    }
                });
            }
        }

        return that;
    }

    function Stage(options) {
        var that = {
            stage: new Kinetic.Stage(options.container, stageW, stageH),
            layers: [],
            target: null,
            history: null,
            logo: null,
            margin: 10,
            clusterColors: [],
            origClusters: [],
            clusters: [],
            width: stageW,
            height: stageH,
            centerX: stageW / 2,
            centerY: stageH / 2,

            back: null,
            forward: null,
            center: null,

            //returns a point which represents servrer coordinates of x, y
            toServerCoords: function (x, y) {
                var minX = that.width / 4;
                var minY = that.width / 4;

                var trgDx = that.width / 2;
                var trgDy = that.width / 2;

                return Point((x - minX) / trgDx, (y - minY) / trgDy);
            },

            toClientCoords: function (pos) {
                var minX = 0.25*that.width;
                var minY = 0.25*that.height;

                var deltaX = 0.5*that.width;
                var deltaY = 0.5*that.height;

                return {
                    x: minX + pos.x*deltaX,
                    y: minY + pos.y*deltaY
                }
            },

            //adds buttons to the stage
            initButtons: function () {
                var centerImg = new Image();

                centerImg.src = "scripts/quint/img/reset-btn.png";

                centerImg.onload = function () {
                    var prop = new Kinetic.Image({
                        image: centerImg,
                        x: .5 * centerImg.width,
                        y: that.height - centerImg.height - that.margin,
                        width: centerImg.width,
                        height: centerImg.height,
                        alpha: 1
                    });

                    prop.on("mouseover", function () {
                        document.body.style.cursor = "pointer";
                        prop.setAlpha(0.8);
                        that.drawProps();
                    });
                    prop.on("mouseout", function () {
                        document.body.style.cursor = "default";
                        prop.setAlpha(1);
                        that.drawProps();
                    });

                    prop.on("mousedown touchend", function () {
                        var currX = that.target.getX();
                        var currY = that.target.getY();
                        var endPos = Point((that.width - that.target.width) / 2, (that.height - that.target.height) / 2);

                        if (currX != endPos.x || currY != endPos.y) {
                            that.history.addItem(endPos);
                            that.moveTarget(that.width / 2, that.height / 2, false);
                        }
                    });

                    that.center = prop;
                    that.addProp(prop);
                    that.drawProps();
                };
            },

            //adds clusters to the stage
            initClusters: function () {
                var colors = that.clusterColors;

                for (var i = that.origClusters.length - 1; i >= 0; i--) {
                    var clust = that.origClusters[i];
                    var cluster = Cluster({
                        stage: that,
                        pos: Point(clust.x, clust.y),
                        radius: clust.size,
                        text: clust.text,
                        color: clust.color == null ? colors[i % colors.length] : clust.color,
                        colorPredefined: clust.color != null,
                        kwords: clust.kwords,
                        clustIdx: i
                    });
                    that.clusters.push(cluster);

                    that.addProp(cluster.prop);
                    if (cluster.tooltip != null)
                        that.addActor(cluster.tooltip);
                }
            },

            //draws the hierarchy of the clusters
            drawHierarchy: function () {
                var context = that.layers[3].getContext();

                for (var i = 0; i < that.origClusters.length; i++) {
                    var parent = that.origClusters[i];
                    var childIdxs = parent.childIdxs;

                    if (childIdxs.length > 0) {
                        context.beginPath();
                        context.lineWidth = 2;
                        context.strokeStyle = "orange";

                        //draw lines to each of the children
                        for (var j = 0; j < childIdxs.length; j++) {
                            var child = that.origClusters[childIdxs[j]];

                            var dist = Math.sqrt(Math.pow(parent.x - child.x, 2) + Math.pow(parent.y - child.y, 2));

                            var k = (child.y - parent.y) / (child.x - parent.x);
                            var fi = Math.atan(k);
                            var alpha = fi + Math.PI / 2;

                            var center = Point((parent.x + child.x) / 2, (parent.y + child.y) / 2);

                            var controlPoint = Point(center.x + Math.cos(alpha) * dist / 3, center.y + Math.sin(alpha) * dist / 3);

                            context.moveTo(parent.x, parent.y);
                            context.quadraticCurveTo(controlPoint.x, controlPoint.y, child.x, child.y);
                        }

                        context.stroke();
                        context.closePath();
                    }
                }
            },

            addHandlers: function () {
                that.stage.on("touchstart", function () {
                    that.moveTimer = window.setTimeout(function () {
                        that.moveTrgToUser();
                    }, 1000);
                });

                that.stage.on("touchend", function () {
                    clearTimeout(that.moveTimer);
                });

                that.stage.on("mousedown", function () {
                    that.moveTrgToUser();
                });
            },

            moveTrgToUser: function () {
                // if the user clicked on the target => don't move the ball
                var target = that.target;
                var pos = that.getUserPosition();
                var targPos = Point(target.getX(), target.getY());

                if (pos != null && (pos.x < targPos.x || pos.x > targPos.x + target.width ||
                        pos.y < targPos.y || pos.y > targPos.y + target.height)) {
                    that.moveTarget(pos.x, pos.y, true);
                }
            },

            centerTarget: function (rerank) {
                that.moveTarget(that.width/2, that.height/2, true, rerank);
            },

            setTargetSrvCoords: function (pos) {
                var clientPos = that.toClientCoords(pos);
                that.moveTarget(clientPos.x, clientPos.y, true, true);
            },

            // moves the target to the position of the cursor/finger
            moveTarget: function (x, y, recordHistory, rerank) {
                if (rerank == null) { rerank = true; }

                var target = that.target;
                if (target.isDragging())
                    return;

                var maxH = that.height - Math.max(that.center.height, 0) - that.margin;
                if (y < maxH && !target.isDragging()) {     //if the user didn't press on the menu
                    // animate the ball
                    target.hideTooltip();

                    //calculate start/end positions
                    var startPos = Point(target.getX(), target.getY());
                    var endPos = Point(x - that.target.width / 2, y - that.target.height / 2);

                    //calculate the distance and direction
                    var dirV = Point(endPos.x - startPos.x, endPos.y - startPos.y);
                    var dist = Math.sqrt(Math.pow(dirV.x, 2) + Math.pow(dirV.y, 2));
                    if (dist == 0)
                        return;

                    dirV = normalize(dirV);

                    //calculate the acceleration
                    var totalTime = 1000;   //1s
                    dist /= 2;  //it will accelerate/break over half the distance
                    var accelTime = totalTime / 2;
                    var avgSpeed = dist / accelTime;
                    var fSpeed = 2 * avgSpeed;    // 2*avgSpeed
                    var accel = fSpeed / accelTime;

                    //animate
                    var currTime = 0;
                    var firstTime = true;
                    that.stage.onFrame(function (frame) {
                        var dt = frame.timeDiff;

                        //adjust the current time
                        if (firstTime) {
                            currTime = 0;
                            firstTime = false;
                        } else
                            currTime += dt;

                        if (currTime < totalTime) {
                            //accelerate or break
                            if (currTime < totalTime / 2) {
                                //accelerate
                                var speed = currTime * accel;
                                var displ = Point(dirV.x * speed * currTime / 2, dirV.y * speed * currTime / 2);

                                target.setPosition(startPos.x + displ.x, startPos.y + displ.y);
                            } else {
                                //break
                                //subtract from end position
                                var time = totalTime - currTime;
                                var speed = time * accel;
                                var displ = Point(dirV.x * speed * time / 2, dirV.y * speed * time / 2);
                                target.setPosition(endPos.x - displ.x, endPos.y - displ.y);
                            }
                        } else {
                            //stop the animation and fetch results
                            that.stage.stop();
                            that.updateTarget(endPos.x, endPos.y, rerank);
                            if (recordHistory) {
                                that.history.addItem(endPos);
                            }
                        }
                    });
                    that.stage.start();
                }
            },

            //hides all the tooltips
            hideTooltips: function () {
                for (var i = 0; i < that.clusters.length; i++) {
                    var cluster = that.clusters[i];
                    if (cluster.tooltip != null)
                        cluster.tooltip.hide();
                }
            },

            //show the tooltip of the cluster with the appropriate index
            showClustTooltip: function (clustIdx) {
                var mousePos = that.getUserPosition();
                var tooltip = that.clusters[clustIdx].tooltip;
                if (mousePos == null || tooltip == null)
                    return;

                tooltip.x = mousePos.x;
                tooltip.y = mousePos.y;
                tooltip.show();
                that.drawActors();
            },

            //returns the position of the cursor/finger
            getUserPosition: function () {
                return that.stage.getUserPosition();
            },

            //adds an object to the target layer
            addTarget: function (target) {
                that.layers[0].add(target);
            },

            //adds an object to the actors layer
            addActor: function (prop) {
                that.layers[1].add(prop);
            },

            //adds an object to the props layer
            addProp: function (prop) {
                that.layers[2].add(prop);
            },

            //removes the prop from the given layer
            remove: function (prop, layer) {
                layer.remove(prop);
            },

            //redraws the target layer
            drawTarget: function () {
                that.layers[0].draw();
            },

            //redraws the actors layer
            drawActors: function () {
                that.layers[1].draw();
            },

            //redraws the props layer
            drawProps: function () {
                that.layers[2].draw();
            },

            drawAll: function () {
                that.drawTarget();
                that.drawActors();
                that.drawProps();
            },

            //sets the targets position
            updateTarget: function (x, y, rerank) {
                that.target.updatePosition(x, y, rerank);
            },

            removeTooltips: function () {
                var clusters = that.clusters;
                var tooltipLayer = that.layers[1];

                for (var i = 0; i < clusters.length; i++) {
                    if (clusters[i].tooltip != null)
                        tooltipLayer.remove(clusters[i].tooltip);
                }
            },

            getTargetPosition: function () {
                return Point(that.target.getX(), that.target.getY());
            },

            refresh: function () {
                that.clusters = [];
                that.layers[2].removeChildren();
                that.layers[2].clear();
                // that.layers[3].clear();

                that.initClusters();
                if (that.target.prop != null)
                    that.target.setPosition((that.width - that.target.width) / 2, (that.height - that.target.height) / 2);

                if (that.center != null) that.addProp(that.center);
                if (that.back != null) that.addProp(that.back);
                if (that.forward != null) that.addProp(that.forward);

                that.history.clear();
                that.drawAll();
                // that.stage.draw();
                that.drawHierarchy();
            },

            initLayers: function () {
                var targetLayer = new Kinetic.Layer();
                var actorsLayer = new Kinetic.Layer();
                var propsLayer = new Kinetic.Layer();
                var backstageLayer = new Kinetic.Layer();

                that.layers[0] = targetLayer;
                that.layers[1] = actorsLayer;
                that.layers[2] = propsLayer;
                that.layers[3] = backstageLayer;

                that.stage.add(backstageLayer);
                that.stage.add(propsLayer);
                that.stage.add(actorsLayer);
                that.stage.add(targetLayer);
            },

            init: function () {
                that.target = Target({ stage: that });
                that.history = History({ stage: that });

                that.initLayers();
                that.initButtons();

                that.addHandlers();

                //draw
                // that.stage.draw();
                that.drawAll();
                that.drawHierarchy();
            }
        }

        //init everything
        that.init();

        return that;
    }


    function WorldStage(options) {
        var that = {
            stage: new Kinetic.Stage(options.container, options.width, options.height),
            layers: [],
            target: null,
            history: null,
            margin: 10,
            width: options.width,
            height: options.height,
            centerX: options.width/2,
            centerY: options.height/2,

            back: null,
            forward: null,
            center: null,

            //returns a point which represents server coordinates of x, y
            toServerCoords: function (x, y) {
                var minX = 0;
                var minY = 0;

                var trgDx = that.width;
                var trgDy = that.height;

                return Point((x - minX) / trgDx, (y - minY) / trgDy);
            },

            moveTrgToUser: function () {
                var target = that.target;
                var pos = that.getUserPosition();
                var targPos = Point(target.getX(), target.getY());
                if (pos != null && (pos.x < targPos.x || pos.x > targPos.x + target.width ||
                        pos.y < targPos.y || pos.y > targPos.y + target.height)) {
                    that.moveTarget(pos.x, pos.y, true);
                }
            },

            //moves the target to the position of the cursor/finger
            moveTarget: function (x, y, recordHistory) {
                var target = that.target;
                if (target.isDragging())
                    return;

                //var maxH = that.height - Math.max(Math.max(that.back.height, that.forward.height), that.center.height) - that.margin;
                if (/*y < maxH && */!target.isDragging()) {     //if the user didn't press on the menu
                    // animate the ball
                    target.hideTooltip();

                    //calculate start/end positions
                    var startPos = Point(target.getX(), target.getY());
                    var endPos = Point(x - that.target.width / 2, y - that.target.height / 2);

                    //calculate the distance and direction
                    var dirV = Point(endPos.x - startPos.x, endPos.y - startPos.y);
                    var dist = Math.sqrt(Math.pow(dirV.x, 2) + Math.pow(dirV.y, 2));
                    if (dist == 0)
                        return;

                    dirV = normalize(dirV);

                    //calculate the acceleration
                    var totalTime = 1000;   //1s
                    dist /= 2;  //it will accelerate/break over half the distance
                    var accelTime = totalTime / 2;
                    var avgSpeed = dist / accelTime;
                    var fSpeed = 2 * avgSpeed;    // 2*avgSpeed
                    var accel = fSpeed / accelTime;

                    //animate
                    var currTime = 0;
                    var firstTime = true;
                    that.stage.onFrame(function (frame) {
                        var dt = frame.timeDiff;

                        //adjust the current time
                        if (firstTime) {
                            currTime = 0;
                            firstTime = false;
                        } else
                            currTime += dt;

                        if (currTime < totalTime) {
                            //accelerate or break
                            if (currTime < totalTime / 2) {
                                //accelerate
                                var speed = currTime * accel;
                                var displ = Point(dirV.x * speed * currTime / 2, dirV.y * speed * currTime / 2);

                                target.setPosition(startPos.x + displ.x, startPos.y + displ.y);
                            } else {
                                //break
                                //subtract from end position
                                var time = totalTime - currTime;
                                var speed = time * accel;
                                var displ = Point(dirV.x * speed * time / 2, dirV.y * speed * time / 2);
                                target.setPosition(endPos.x - displ.x, endPos.y - displ.y);
                            }
                        } else {
                            //stop the animation and fetch results
                            that.stage.stop();
                            that.updateTarget(endPos.x, endPos.y);
                            if (recordHistory)
                                that.history.addItem(endPos);
                        }
                    });
                    that.stage.start();
                }
            },

            getUserPosition: function () {
                return that.stage.getUserPosition();
            },

            addTarget: function (prop) {
                that.layers[0].add(prop);
            },

            addProp: function (prop) {
                //that.layers[1].add(prop);
            },

            remove: function (prop) {
                that.layers[0].remove(prop);
            },

            drawTarget: function () {
                that.layers[0].draw();
            },

            drawProps: function () {
                //that.layers[1].draw();
            },

            updateTarget: function (x, y) {
                that.target.updatePosition(x, y);
            },

            getTargetPosition: function () {
                if ($('#disable_world_cb').attr('checked'))
                    return Point(that.target.getX(), that.target.getY());
                else return Point(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
            },

            initLayers: function () {
                var targetLayer = new Kinetic.Layer();
                //var propLayer = new Kinetic.Layer();

                that.layers.push(targetLayer);
                //that.layers.push(propLayer);

                that.stage.add(targetLayer);
                //that.stage.add(propLayer);
            },

            addHandlers: function () {
                var stage = that.stage;
                stage.on('touchstart', function () {
                    if ($('#disable_world_cb').attr('checked')) {
                        that.moveTimer = window.setTimeout(function () {
                            that.stage.moveTrgToUsr();
                        }, 1000);
                    }
                });

                that.stage.on('touchend', function () {
                    clearTimeout(that.moveTimer);
                });

                that.stage.on('mousedown', function () {
                    if ($('#disable_world_cb').attr('checked'))
                        that.moveTrgToUser();
                });
            },

            init: function () {
                that.initLayers();
                that.addHandlers();

                that.target = Target({stage: that});
                that.history = History({stage: that});

                $('#disable_world_cb').click(function (event) {
                    if ($('#disable_world_cb').attr('checked')) {
                        // move to last point in history
                        var pos = that.history.getPrevious();
                        that.moveTarget(pos.x + that.target.width/2, pos.y + that.target.height/2, true);
                        that.target.prop.draggable(true);
                    } else {
                        that.target.prop.draggable(false);
                        that.moveTarget(that.width/2, that.height/2, true);
                    }
                });

                that.stage.draw();
            }
        };

        that.init();

        return that;
    }

    function processSubmit (clustering) {
        var searchSubm = document.getElementById('clustering_fld');

        var path = window.location.pathname;

        var slashIdx = path.lastIndexOf('/');

        var url;
        if (slashIdx < 0)
            url = path + '/result.html?q=' + $('#q').val() + '&c=' + clustering;
        else {
            var basePath = path.substring(0, slashIdx);
            url = basePath + '/result.html?q=' + $('#q').val() + '&c=' + clustering;
        }

        window.location.href = url;
    }

    function normalize(v) {
        var norm = Math.sqrt(Math.pow(v.x, 2) + Math.pow(v.y, 2));
        return Point(v.x / norm, v.y / norm);
    }

    function scalarProd(v1, v2) {
        var sum = 0;
        sum += v1.x * v2.x;
        sum += v1.y * v2.y;

        return sum;
    }

    function worldRankingDisabled() {
        return $('#disable_world').attr('checked');
    }

    //======================================
    // INITIALIZE
    //======================================

    stages = [
        Stage({
            container: containerId
        })
    ];
    listCont = new ListController();
    service = new DataService();

    return {
        // list: ListController,
        setWidget: function () {
            service.onData.apply(service, arguments);
        },
        center: function (doRerank) {
            var stage = stages[0];
            stage.centerTarget(doRerank);
        },
        reposition: function (newPosition) {
            var stage = stages[0];
            stage.setTargetSrvCoords(newPosition);
        }
    }
}
