/* Coordinate systems in the plots:
(note: paper and viewbox have y0 at large y because pixels start at upper left,
not lower left)

Data coordinates: xd,yd
    visible range: xd0-xd1, yd0-yd1 (gl.xaxis.range[0-1], gl.yaxis.range[0-1]

Paper coordinates: xp,yp (where axes are drawn, minus gl.margin:.l,.t)
    plot box: xp0-xp1, yp0-yp1 (0 - gd.plotwidth, gd.plotheight - 0)
    transform: xp = mx*xd+bx, yp = my*yd+by
        mx = gl.xaxis.m = gd.plotwidth/(gl.xaxis.range:[1]-[0])
        bx = gl.xaxis.b = -mx*gl.xaxis.range[0]
        my = gl.yaxis.m = gd.plotheight/(gl.yaxis.range:[0]-[1])
        by = gl.yaxis.b = -my*gl.yaxis.range[1]
Viewbox coordinates: xv,yv (where data are drawn)
    plot box: xv0-xv1, yv0-yv1 (gd.viewbox: .x - .x+.w, .y+.h - .y)
        initial viewbox: 0 - gd.plotwidth, gd.plotheight - 0
    transform: xv = xp+b2x, yv = yp+b2y
        panning: subtract dx,dy from viewbox:.x,.y
        zooming: viewbox will not scale x and y differently, at least in Chrome, so for
            zoom we will move the individual points.
*/

// ----------------------------------------------------
// Main plot-creation function. Note: will call newPlot
// if necessary to create the framework
// ----------------------------------------------------
function plot(divid, data, layout) {
    // Get the container div: we will store all variables as properties of this div
    // (for extension to multiple graphs per page)
    // some callers send this in by dom element, others by id (string)
    var gd=(typeof divid == 'string') ? document.getElementById(divid) : divid;
	var defaultColors=['#00e','#a00','#0c0','#000']

/*  data should be an array of objects, one per trace. allowed keys:

    type: (string) scatter (default)

    x: (float array), or x0:(float) and dx:(float)
        if neither x, x0, or dx exists, defaults is x0:0, dx:1

    y: (float array), or y0:(float) and dy:(float)
        if neither y, y0, or dy exists, defaults to y0:0, dy:1
        you may provide x and/or y arrays, but not neither

    marker: (object):
        symbol: (string) circle (default)
        color: (cstring), or (cstring array)
        line: (object):
            color: (cstring), or (cstring array)
            width: (float px), default 0

    line: (object):
        color: (cstring), or (cstring array)
        width: (float px), default 1
        
    text: (string array) hover text for each point

    name: <string for legend>
    
    cstring is a string with any valid HTML color
    if any one color is provided, all others not provided will copy it
    if no colors are provided, choose one from a default set based on the trace number

    eventually I'd like to make all of the marker and line properties accept arrays
    to modify properties point-by-point
    
    any array also has a corresponding src attribute, ie xsrc for x
    this is a string:
    	<id>/<colname> for your own data, 
    	<user>/<id>/<colname> for shared data
    
*/  

    // if there is already data on the graph, append the new data
    // if you only want to redraw, pass non-object (null, '', whatever) for data
    var graphwasempty = ((typeof gd.data==='undefined') && $.isArray(data));
    if(typeof data=='object') {
        if(graphwasempty) gd.data=data;
        else gd.data.push.apply(gd.data,data);
    }

    // make the graph container and axes, if they don't already exist
    // note: if they do already exist, the new layout gets ignored (as it should)
    // unless there's no data there yet... then it should destroy and remake the plot
    if((typeof gd.layout==='undefined')||graphwasempty) newPlot(divid, layout);

    var gl=gd.layout, vb=gd.viewbox, gdd=gd.data, gp=gd.plot;
    var xa=gl.xaxis, ya=gl.yaxis, xdr=gl.xaxis.drange, ydr=gl.yaxis.drange;
    var x, xy, y, i, serieslen;
    xdr=[null,null];
    ydr=[null,null];

    //remove all existing plotted data, make the drawing containers
    for(curve in gdd) {
        if(typeof gdd[curve].drawing!=='undefined')
            for(i in gdd[curve].drawing) gdd[curve].drawing[i].remove();
        gdd[curve].drawing={};
    }

    // plot all the data
    // go through all the data twice, first for finding the range, second for plotting
    for(iter=Math.max(xa.autorange,ya.autorange)?0:1; iter<2; iter++) {
        for(curve in gdd) { 
            if('color' in gdd[curve]) color=gdd[curve].color;
            else color=defaultColors[curve % defaultColors.length];
            
            //default type is scatter
            if(!('type' in gdd[curve]) || (gdd[curve].type=='scatter')) {
                // verify that data exists, and make scaled data if necessary
                if(!('y' in gdd[curve]) && !('x' in gdd[curve])) continue; // no data!
                
                if('y' in gdd[curve]) y=gdd[curve].y;
                else if(!('y0' in gdd[curve]) && !('dy' in gdd[curve])) continue; // no scaling!
                else {
                    y=[];
                    for(i in x) y.push(gdd[curve].y0+i*gdd[curve].dy);
                }
    
                if('x' in gdd[curve]) x=gdd[curve].x;
                else if(!('x0' in gdd[curve]) && !('dx' in gdd[curve])) continue; // no scaling!
                else {
                    x=[];
                    for(i in y) x.push(gdd[curve].x0+i*gdd[curve].dx);
                }
                serieslen=Math.min(x.length,y.length);
                if(iter==0) {
                	xdr=[aggNums(Math.min,xdr[0],x,serieslen),aggNums(Math.max,xdr[1],x,serieslen)];
                	ydr=[aggNums(Math.min,ydr[0],y,serieslen),aggNums(Math.max,ydr[1],y,serieslen)];
                }
                else {
                    // lines
                    gp.setStart();
                    for(i=1; i<serieslen; i++) {
                    	if(i>0 && $.isNumeric(x[i-1]) && $.isNumeric(x[i]) &&
                    		$.isNumeric(y[i-1]) && $.isNumeric(y[i])){
                    			gp.path(Raphael.format('M{0},{1}L{2},{3}',
                        		xa.b+xa.m*x[i-1]+vb.x,ya.b+ya.m*y[i-1]+vb.y,
                        		xa.b+xa.m*x[i]+vb.x,ya.b+ya.m*y[i]+vb.y));
                        }
                    }
                    gdd[curve].drawing['lines']=gp.setFinish();
                    gdd[curve].drawing['lines'].attr({'stroke':color});
                    
                    // points
                    gp.setStart();
                    for(i=0; i<serieslen; i++) {
                    	if($.isNumeric(x[i]) && $.isNumeric(y[i]))
	                    	gp.circle(xa.b+xa.m*x[i]+vb.x,ya.b+ya.m*y[i]+vb.y,3);
                    }
                    gdd[curve].drawing['points']=gp.setFinish();
                    gdd[curve].drawing['points'].attr({'fill':color,'stroke-width':0});
                }
            }
        }
        if((iter==0) && ($.isNumeric(xdr[0]))) {
            if(xa.autorange) xa.range=[1.05*xdr[0]-0.05*xdr[1],1.05*xdr[1]-0.05*xdr[0]];
            if(ya.autorange) ya.range=[1.05*ydr[0]-0.05*ydr[1],1.05*ydr[1]-0.05*ydr[0]];
            doXTicks(gd);doYTicks(gd);doXGrid(gd);doYGrid(gd);
            gd.axdrags.toFront();
        }
    }
    return('*ta-da*')
}

// convenience function to aggregate value v and array a (up to len)
// using function f (ie Math.min, etc)
// throwing out non-numeric values
function aggNums(f,v,a,len) {
	var r=($.isNumeric(v)) ? v : null;
	for(var i=0; i<len; i++) if($.isNumeric(a[i])) r=($.isNumeric(r)) ? f(r,a[i]) : a[i];
	return r;
}

// ----------------------------------------------------
// Create the plot container and axes
// ----------------------------------------------------
function newPlot(divid, layout) {
    // Get the container div: we will store all variables as properties of this div
    // (for extension to multiple graphs per page)
    // some callers send this in already by dom element
    var gd=(typeof divid == 'string') ? document.getElementById(divid) : divid;

    // destroy any plot that already exists in this div
    gd.innerHTML='';

    // Get the layout info (this is the defaults)
    gd.layout={title:'Glass Washer',
        xaxis:{range:[-5,5],tick0:0,dtick:2,ticklen:5,
            autorange:1,autotick:1,drange:[null,null],
            title:'Time',unit:'hours'},
        yaxis:{range:[-4,4],tick0:0,dtick:1,ticklen:5,
            autorange:1,autotick:1,drange:[null,null],
            title:'pH',unit:''},
        width:600,
        height:400,
        margin:{l:50,r:10,t:30,b:40,pad:2},
        paper_bgcolor:'#fff',
        plot_bgcolor:'#fff' };
        // TODO: add font size controls, and label positioning
        // TODO: add legend
        // TODO: use hard coded one for defaults, take any new properties from input param

    // look for elements of gd.layout to replace with the equivalent elements in layout
    gd.layout=updateObject(gd.layout,layout);

    // Make the graph containers
    // We use a hack to get two nested Raphael objects (Raphael 2.0.1)
    // First one (paper) is for the axes
    var gl=gd.layout;
    gd.paper=Raphael(divid,gl.width,gl.height);
    gd.paper.gd=gd; // so any element can get gd from this.paper.gd
    gd.plotwidth=gl.width-gl.margin.l-gl.margin.r;
    gd.plotheight=gl.height-gl.margin.t-gl.margin.b;
    gd.ax=gd.paper.rect(gl.margin.l-gl.margin.pad,
        gl.margin.t-gl.margin.pad,
        gd.plotwidth+2*gl.margin.pad,
        gd.plotheight+2*gl.margin.pad);
    gd.paperDOM=gd.firstChild;
    gd.paperDOM.style['background-color']=gl.paper_bgcolor;

    // Second one (plot) is for the data
    gd.plot=Raphael(gd.paperDOM,gd.plotwidth,gd.plotheight);
    gd.plot.gd=gd; // so any element can get gd from this.paper.gd
    gd.plotDOM=gd.paperDOM.childNodes[0];
    gd.plotDOM.style.position='';
    gd.plotDOM.setAttribute('x',gl.margin.l);
    gd.plotDOM.setAttribute('y',gl.margin.t);
    gd.viewbox={x:0,y:0};
    gd.plotbg=gd.plot.rect(-screen.width,-screen.height,
        gd.plotwidth+2*screen.width,gd.plotheight+2*screen.height);
    gd.plotbg.attr({'fill':gl.plot_bgcolor,'stroke':''});
    gd.plotbg.node.style.cursor='move';

    // make the ticks, grids, and titles
    doXTicks(gd);doYTicks(gd);doXGrid(gd);doYGrid(gd);
    gl.xaxis.r0=gl.xaxis.range[0];
    gl.yaxis.r0=gl.yaxis.range[0];

    makeTitles(gd,'');
    
    //make the axis drag objects
    var x0=gd.ylabels.getBBox().x;
    var x1=gd.ax.attr('x');
    var x2=x1+gd.ax.attr('width');
    var y2=gd.ax.attr('y');
    var y1=y2+gd.ax.attr('height');
    var yb=gd.xlabels.getBBox();
    var y0=yb.y+yb.height;
    
    gd.paper.setStart();
    gd.xdrag=gd.paper.rect(x1*0.9+x2*0.1,y1,(x2-x1)*0.8,y0-y1);
    gd.xdrag.node.style.cursor='ew-resize';
    gd.x0drag=gd.paper.rect(x1,y1,(x2-x1)*0.1,y0-y1);
    gd.x0drag.node.style.cursor='w-resize';
    gd.x1drag=gd.paper.rect(x1*0.1+x2*0.9,y1,(x2-x1)*0.1,y0-y1);
    gd.x1drag.node.style.cursor='e-resize';

    gd.ydrag=gd.paper.rect(x0,y2*0.9+y1*0.1,x1-x0,(y1-y2)*0.8);
    gd.ydrag.node.style.cursor='ns-resize';
    gd.y0drag=gd.paper.rect(x0,y1*0.9+y2*0.1,x1-x0,(y1-y2)*0.1);
    gd.y0drag.node.style.cursor='s-resize';
    gd.y1drag=gd.paper.rect(x0,y2,x1-x0,(y1-y2)*0.1);
    gd.y1drag.node.style.cursor='n-resize';
    
    gd.nwdrag=gd.paper.rect(x0,y2+y1-y0,x1-x0,y0-y1);
    gd.nwdrag.node.style.cursor='nw-resize';
    gd.nedrag=gd.paper.rect(x2,y2+y1-y0,x1-x0,y0-y1);
    gd.nedrag.node.style.cursor='ne-resize';
    gd.swdrag=gd.paper.rect(x0,y1,x1-x0,y0-y1);
    gd.swdrag.node.style.cursor='sw-resize';
    gd.sedrag=gd.paper.rect(x2,y1,x1-x0,y0-y1);
    gd.sedrag.node.style.cursor='se-resize';

    gd.axdrags=gd.paper.setFinish();
    gd.axdrags.attr({'stroke':'','fill':'rgba(0,0,0,0)'});

    // the 'gd's at the end become 'this' in the fcns
    gd.plotbg.drag(plotDrag,plotDragStart,resetViewBox,gd,gd,gd);

    gd.nwdrag.drag(nwDrag,plotDragStart,zoomEnd,gd,gd,gd);
    gd.nedrag.drag(neDrag,plotDragStart,zoomEnd,gd,gd,gd);
    gd.swdrag.drag(swDrag,plotDragStart,zoomEnd,gd,gd,gd);
    gd.sedrag.drag(seDrag,plotDragStart,zoomEnd,gd,gd,gd);

    gd.x0drag.drag(x0Drag,xDragStart,zoomEnd,gd,gd,gd);
    gd.x1drag.drag(x1Drag,xDragStart,zoomEnd,gd,gd,gd);
    gd.y0drag.drag(y0Drag,yDragStart,zoomEnd,gd,gd,gd);
    gd.y1drag.drag(y1Drag,yDragStart,zoomEnd,gd,gd,gd);

	// Remove the hover title "Raphael's object" that Raphael makes...
    gd.removeAttribute('title');    

    // some drag events need to be built by hand from mousedown, mousemove, mouseup
    // because dblclick doesn't register otherwise. Probably eventually all
    // drag events will need to be this way, once we layer on enough functions...

    // gd.mouseUp stores ms of last mouseup event on the drag bars
    // so we can check for doubleclick when we see two mouseup events within
    // gd.dblclickdelay ms 
    // gd.dragged stores whether a drag has occurred, so we don't have to
    // resetViewBox unnecessarily (ie if no move bigger than gd.mindrag pixels)
    gd.mouseUp=0;
    gd.dblclickdelay=300;
    gd.mindrag=5; 
    
    gd.xdrag.node.onmousedown = function(e) {
        xDragStart.call(gd,null,null);
        gd.dragged = false;
        window.onmousemove = function(e2) {
            gd.dragged=(Math.abs(e2.clientX-e.clientX)>gd.mindrag);
            if(gd.dragged) xDrag.call(gd,e2.clientX-e.clientX,0);
            else xDrag.call(gd,0,0);
            pauseEvent(e2);
        }
        window.onmouseup = function(e2) {
            var d=(new Date()).getTime();
            if(d-gd.mouseUp<gd.dblclickdelay) xAuto.call(gd);
            else if(gd.dragged) resetViewBox.call(gd);
            gd.mouseUp = d;
            window.onmousemove = null; window.onmouseup = null;
        }
        pauseEvent(e);
    }
    
    gd.ydrag.node.onmousedown = function(e) {
        yDragStart.call(gd,null,null);
        gd.dragged = false;
        window.onmousemove = function(e2) {
            gd.dragged=(Math.abs(e2.clientY-e.clientY)>gd.mindrag);
            if(gd.dragged) yDrag.call(gd,0,e2.clientY-e.clientY);
            else yDrag.call(gd,0,0);
            pauseEvent(e2);
        }
        window.onmouseup = function(e2) {
            var d=(new Date()).getTime();
            if(d-gd.mouseUp<gd.dblclickdelay) yAuto.call(gd);
            else if(gd.dragged) resetViewBox.call(gd);
            gd.mouseUp = d;
            window.onmousemove = null; window.onmouseup = null;
        }
        pauseEvent(e);
    }

    // add the graph menu
    var menudiv=document.createElement('div');
    $(gd).prepend(menudiv).css({'position':'relative'});
    $(menudiv).css({'position':'absolute','top':0,'left':620,'z-index':5000})
    menudiv.id='mdiv-'+gd.id;
    menudiv.innerHTML=
	"<ul class='nav nav-pills' style='width: 50px;'><li class='dropdown' id='menu-" + gd.id + "'>" +
    "<a class='dropdown-toggle' data-toggle='dropdown' href='#menu-" + gd.id + "'>" +
    "<img src='/static/bootstrap/img/png/glyphicons_019_cogwheel.png'/>" +	
	"<b class='caret'></b></a><ul class='dropdown-menu' style='width:0px'>" +
        "<li><a href='#' onclick='saveGraph(\"" + gd.id + "\")'><i class='icon-share-alt' style='width:20px; height:20px;'></i> Save Graph</a></li>" +
        "<li><a href='#' id='cmdlntog' onclick='togCmdLn()' data-state='hide'><img src='/static/img/scipyshiny_small.png' style='display:inline'/> Show Numpy</a></li>" +
    "</ul></li></ul>";
}

function makeTitles(gd,title) {
    var gl=gd.layout;
    if(title in {'':0,'xtitle':0}) {
        if(gl.xaxis.title=='')
            gd.xtitle=hoverBox(gd, (gl.margin.l-gl.margin.r)/2+gl.width/4, gl.height-10-(14/2), gl.width/2, 14)
        else
            gd.xtitle=gd.paper.text((gl.width+gl.margin.l-gl.margin.r)/2, gl.height-10, gl.xaxis.title)
                .attr({'font-size':14});
        gd.xtitle.dblclick(function(){autoGrowInput(gd,'xtitle', gl.xaxis, 'title', {});});
    }
    if(title in {'':0,'ytitle':0}) {
        if(gl.yaxis.title=='')
            gd.ytitle=hoverBox(gd, 20-14/2, (gl.margin.t-gl.margin.b)/2+gl.height/4, 14, gl.height/2)
        else
            gd.ytitle=gd.paper.text(20, (gl.height+gl.margin.t-gl.margin.b)/2, gl.yaxis.title)
                .rotate(-90).attr({'font-size':14})
        gd.ytitle.dblclick(function(){autoGrowInput(gd,'ytitle', gl.yaxis, 'title', {center: 0});});
    }
    if(title in {'':0,'gtitle':0}) {
        if(gl.title=='')
            gd.gtitle=hoverBox(gd, gl.width/4, gl.margin.t/2-16/2, gl.width/2, 16)
        else
            gd.gtitle=gd.paper.text(gl.width/2,gl.margin.t/2,gl.title)
                .attr({'font-size':16})
        gd.gtitle.dblclick(function(){autoGrowInput(gd,'gtitle', gl, 'title', {});});
    }
}

function hoverBox(gd,l,t,w,h) {
    box=gd.paper.rect(l,t,w,h)
            .attr({'stroke':'','fill':'rgba(0,0,0,0)'})
            .hover(function(){this.attr('stroke','rgba(0,0,0,0.5)');},
                function(){this.attr('stroke','rgba(0,0,0,0)');});
    box.node.style.cursor='text';
    return box;
}

function updateObject(i,up) {
    if(!$.isPlainObject(up)) return i;
    up.o={}; // seems like JS doesn't fully implement recursion... if I say o={} here then each level destroys the previous.
    for(key in i) {
        if(key in up) {
            if($.isPlainObject(i[key])) up.o[key]=updateObject(i[key],up[key]);
            else up.o[key]=up[key];
        }
        else up.o[key]=i[key];
    }
    return up.o;
}

// to prevent text selection during drag.
// see http://stackoverflow.com/questions/5429827/how-can-i-prevent-text-element-selection-with-cursor-drag
function pauseEvent(e){
    if(e.stopPropagation) e.stopPropagation();
    if(e.preventDefault) e.preventDefault();
    e.cancelBubble=true;
    e.returnValue=false;
    return false;
}

// auto-grow text input field, for editing graph items
// from http://jsbin.com/ahaxe, heavily edited
// to grow centered, set o.center!=0
// el is the raphael element containing the edited text (eg gd.xtitle)
// cont is the location the value is stored (eg gd.layout.xaxis)
// prop is the property name in that container (eg 'title')
// o is the settings for the input box (can be left blank to use defaults below)
// This is a bit ugly... but it's the only way I could find to pass in the element
// (and layout var) totally by reference...
function autoGrowInput(gd,el,cont,prop,o) {
    // if box is initially empty, it's a hover box so we can't grab its properties:
    // so make a dummy element to get the right properties; it will be deleted
    // immediately after grabbing properties.
    if($.trim(cont[prop])=='') {
        gd[el].remove();
        cont[prop]='l'; // very narrow string, so we can ignore its width
        makeTitles(gd,el);
        cont[prop]='';
    }
    
    o = $.extend({
        maxWidth: 1000,
        minWidth: 20,
        comfortZone: gd[el].attr('font-size')+3,
        center: 1
    }, o);

    var elTstr=gd[el].transform(),
        elFs=gd[el].attr('font-size'),
        elX=gd[el].attr('x'),
        elY=gd[el].attr('y');

    var inbox=document.createElement('input'),
        pos=$(gd[el].node).position(),
        gpos=$(gd.paperDOM).position(),
        bbox=gd[el].getBBox();

    $(gd).prepend(inbox);
    var input=$(inbox);
    
    input.css({
        position:'absolute',
        top: ((elTstr.length>0 && elTstr[0][0]=='r' && elTstr[0][1]!=0) ?
            (bbox.height-bbox.width)/2 : 0) + pos.top + gpos.top - 4,
        left: pos.left + gpos.left - 4, // shouldn't hard-code these -4's, but can't figure out how to determine them
        'z-index':6000,
        // not sure how many of these are needed, but they don't seem to hurt...
        //TODO: this can't find the right vals if the box is blank...
        fontSize: gd[el].attr('font-size'),
        fontFamily: gd[el].attr('font-family'),
        fontWeight: gd[el].attr('font-weight'),
        fontStyle: gd[el].attr('font-style'),
        fontStretch: gd[el].attr('font-stretch'),
        fontVariant: gd[el].attr('font-variant'),
        letterSpacing: gd[el].attr('letter-spacing'),
        wordSpacing: gd[el].attr('word-spacing')
    });
    input.val($.trim(cont[prop]));

    var minWidth = o.minWidth || input.width(),
        val = input.val(),
        testSubject = $('<tester/>').css({
            position: 'absolute',
            top: -9999,
            left: -9999,
            width: 'auto',
            fontSize: input.css('fontSize'),
            fontFamily: input.css('fontFamily'),
            fontWeight: input.css('fontWeight'),
            fontStyle: input.css('fontStyle'),
            fontStretch: input.css('fontStretch'),
            fontVariant: input.css('fontVariant'),
            letterSpacing: input.css('letterSpacing'),
            wordSpacing: input.css('wordSpacing'),
            whiteSpace: 'nowrap'
        });
    testSubject.insertAfter(input);
    testSubject.html(escaped(val));
    input.width(Math.max(testSubject.width()*1.2+o.comfortZone,minWidth));

    var left0=input.position().left+(input.width()/2);
    
    // take away the existing one as soon as the input box is made
    gd[el].remove()
    inbox.select();
    
    input.bind('keyup keydown blur update',function(e) {
        var valold=val;
        val=input.val();
        
        // leave the input or press return: accept the change
        if((e.type=='blur') || (e.type=='keydown' && e.which==13)) {
            cont[prop]=$.trim(val);
            makeTitles(gd,el);
            input.remove();
        }
        // press escape: revert the change
        else if(e.type=='keydown' && e.which==27) {
            input.remove();
        }
        // otherwise, if no change to val, stop
        if(val === valold) return;

        // Enter new content into testSubject
        testSubject.html(escaped(val));

        // Calculate new width + whether to change
        var newWidth = Math.max(testSubject.width()+o.comfortZone,minWidth),
            currentWidth = input.width();

        // Animate width
        if((newWidth < currentWidth && newWidth >= minWidth) || (newWidth > minWidth && newWidth < o.maxWidth)) {
            if(o.center!=0) input.css('left', left0-newWidth/2);//input.position().left+(currentWidth-newWidth)/2);
            input.width(newWidth);
        }
    });
}

function escaped(val) {
    return val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s/g, '&nbsp;');
}

// autoscale one axis
function xAuto() {
    this.layout.xaxis.autorange=1;
    plot(this,'','');
}

function yAuto() {
    this.layout.yaxis.autorange=1;
    plot(this,'','');
}

// ----------------------------------------------------
// Axis dragging functions
// ----------------------------------------------------

// common transform for dragging one end of an axis
// d>0 is compressing scale, d<0 is expanding
function dZoom(d) {
    if(d>=0) return 1 - Math.min(d,0.9);
    else return 1 - 1/(1/Math.max(d,-0.3)+3.222);
}

function plotDragStart(x,y) {
    var gx=this.layout.xaxis, gy=this.layout.yaxis;
    gx.r0=[gx.range[0],gx.range[1]];
    gy.r0=[gy.range[0],gy.range[1]];
    gx.autorange=0;gy.autorange=0;
}

function xDragStart(x,y) {
    var gx=this.layout.xaxis;
    gx.r0=[gx.range[0],gx.range[1]];
    gx.autorange=0;
}

function yDragStart(x,y) {
    var gy=this.layout.yaxis;
    gy.r0=[gy.range[0],gy.range[1]];
    gy.autorange=0;
}

function dragTail(gd) {
    doXTicks(gd);doYTicks(gd);
    doXGrid(gd);doYGrid(gd);
    gd.axdrags.toFront();
    plot(gd,'','');
}

function resetViewBox() {
    this.viewbox={x:0,y:0};
    this.plot.setViewBox(0,0,this.plotwidth,this.plotheight,false);
    this.plotbg.attr({'x':-screen.width, 'y':-screen.height})
    dragTail(this);
}

function zoomEnd() {
    //nothing to do here any more...
    var vb=this.viewbox;
}

function plotDrag(dx,dy) {
    var gx=this.layout.xaxis;
    var gy=this.layout.yaxis;
    this.viewbox={x:-dx,y:-dy};
    this.plot.setViewBox(-dx,-dy,this.plotwidth,this.plotheight,false);
    gx.range=[gx.r0[0]-dx/gx.m,gx.r0[1]-dx/gx.m];
    gy.range=[gy.r0[0]-dy/gy.m,gy.r0[1]-dy/gy.m];
    doXTicks(this);doYTicks(this);
}

function xDrag(dx,dy) {
    var gx=this.layout.xaxis;
    this.viewbox.x=-dx;
    this.plot.setViewBox(-dx,0,this.plotwidth,this.plotheight,false);
    gx.range=[gx.r0[0]-dx/gx.m,gx.r0[1]-dx/gx.m];
    doXTicks(this);
}

function yDrag(dx,dy) {
    var gy=this.layout.yaxis;
    this.viewbox.y=-dy;
    this.plot.setViewBox(0,-dy,this.plotwidth,this.plotheight,false);
    gy.range=[gy.r0[0]-dy/gy.m,gy.r0[1]-dy/gy.m];
    doYTicks(this);
}

function nwDrag(dx,dy) {
    var gx=this.layout.xaxis, gy=this.layout.yaxis;
    var pw=this.plotwidth, ph=this.plotheight;
    gx.range[0]=gx.r0[1]+(gx.r0[0]-gx.r0[1])/dZoom(dx/pw);
    gy.range[1]=gy.r0[0]+(gy.r0[1]-gy.r0[0])/dZoom(dy/ph);
    dragTail(this);
}

function neDrag(dx,dy) {
    var gx=this.layout.xaxis, gy=this.layout.yaxis;
    var pw=this.plotwidth, ph=this.plotheight;
    gx.range[1]=gx.r0[0]+(gx.r0[1]-gx.r0[0])/dZoom(-dx/pw);
    gy.range[1]=gy.r0[0]+(gy.r0[1]-gy.r0[0])/dZoom(dy/ph);
    dragTail(this);
}

function swDrag(dx,dy) {
    var gx=this.layout.xaxis, gy=this.layout.yaxis;
    var pw=this.plotwidth, ph=this.plotheight;
    gx.range[0]=gx.r0[1]+(gx.r0[0]-gx.r0[1])/dZoom(dx/pw);
    gy.range[0]=gy.r0[1]+(gy.r0[0]-gy.r0[1])/dZoom(-dy/ph);
    dragTail(this);
}

function seDrag(dx,dy) {
    var gx=this.layout.xaxis, gy=this.layout.yaxis;
    var pw=this.plotwidth, ph=this.plotheight;
    gx.range[1]=gx.r0[0]+(gx.r0[1]-gx.r0[0])/dZoom(-dx/pw);
    gy.range[0]=gy.r0[1]+(gy.r0[0]-gy.r0[1])/dZoom(-dy/ph);
    dragTail(this);
}

function x0Drag(dx,dy) {
    var ga=this.layout.xaxis;
    var pw=this.plotwidth;
    ga.range[0]=ga.r0[1]+(ga.r0[0]-ga.r0[1])/dZoom(dx/pw);
    dragTail(this);
}

function x1Drag(dx,dy) {
    var ga=this.layout.xaxis;
    var pw=this.plotwidth;
    ga.range[1]=ga.r0[0]+(ga.r0[1]-ga.r0[0])/dZoom(-dx/pw);
    dragTail(this);
}

function y1Drag(dx,dy) {
    var ga=this.layout.yaxis;
    var ph=this.plotheight;
    ga.range[1]=ga.r0[0]+(ga.r0[1]-ga.r0[0])/dZoom(dy/ph);
    dragTail(this);
}

function y0Drag(dx,dy) {
    var ga=this.layout.yaxis;
    var ph=this.plotheight;
    ga.range[0]=ga.r0[1]+(ga.r0[0]-ga.r0[1])/dZoom(-dy/ph);
    dragTail(this);
}

// ----------------------------------------------------
// Ticks and grids
// ----------------------------------------------------

// if ticks are set to automatic, determine the right values (tick0,dtick)
// in any case, return how many digits to round tick labels to
function autoTicks(a) {
    if(a.autotick) {
        // auto ticks always start at 0
        a.tick0=0;
        var nt=10; // max number of ticks to display
        var rt=Math.abs(a.range[1]-a.range[0])/nt;
        var rtexp=Math.pow(10,Math.floor(Math.log(rt)/Math.LN10));
        var rtmantissa=rt/rtexp;
        
        // round tick spacing up 1-2->2, 2-5->5, 5-10->10
        if(rtmantissa>5) a.dtick=rtexp*10;
        else if(rtmantissa>2) a.dtick=rtexp*5;
        else a.dtick=rtexp*2;
    }
    //round tick labels to 2 digits past largest digit of dtick
    return Math.pow(10,2-Math.round(Math.log(a.dtick)/Math.LN10));
}

function doXTicks(gd) {
    if(typeof gd.xticks != 'undefined') {gd.xticks.remove();gd.xlabels.remove();}
    var gl=gd.layout;
    var gm=gl.margin;
    var a=gl.xaxis;
    var y1=gl.height-gm.b+gm.pad;
    
    var tickround=autoTicks(a);
    a.tickround=tickround;
    
    // ticks
    gd.paper.setStart();
    a.m=gd.plotwidth/(a.range[1]-a.range[0]);
    a.b=-a.m*a.range[0];
    a.tmin=Math.ceil((a.range[0]-a.tick0)/a.dtick)*a.dtick+a.tick0;
    for(var x=a.tmin;x<=a.range[1];x+=a.dtick){
        gd.paper.path(Raphael.format('M{0},{1}v{2}', gm.l+a.m*x+a.b, y1, a.ticklen))}
    gd.xticks=gd.paper.setFinish();
    
    // tick labels
    gd.paper.setStart();
    for(x=a.tmin;x<=a.range[1];x+=a.dtick){
        gd.paper.text(gm.l+a.m*x+a.b, y1+a.ticklen,
            Raphael.format('\n{0}', Math.round(x*tickround)/tickround))}
    gd.xlabels=gd.paper.setFinish();
    gd.xlabels.attr({'font-size':12});
}

function doYTicks(gd) {
    if(typeof gd.yticks != 'undefined') {gd.yticks.remove();gd.ylabels.remove();}
    var gl=gd.layout;
    var gm=gl.margin;
    var a=gl.yaxis;
    var x1=gm.l-gm.pad;

    var tickround=autoTicks(a);
    
    // ticks
    gd.paper.setStart();
    a.m=gd.plotheight/(a.range[0]-a.range[1]);
    a.b=-a.m*a.range[1];
    a.tmin=Math.ceil((a.range[0]-a.tick0)/a.dtick)*a.dtick+a.tick0;
    for(var x=a.tmin;x<=a.range[1];x+=a.dtick){
        gd.paper.path(Raphael.format('M{0},{1}h{2}', x1, gm.t+a.m*x+a.b, -a.ticklen))}
    gd.yticks=gd.paper.setFinish();

    // tick labels
    gd.paper.setStart();
    for(x=a.tmin;x<=a.range[1];x+=a.dtick){
        gd.paper.text(x1-a.ticklen, gm.t+a.m*x+a.b,
            Raphael.format('{0}',Math.round(x*tickround)/tickround))}
    gd.ylabels=gd.paper.setFinish();
    gd.ylabels.attr({'font-size':12,'text-anchor':'end'});
}

function doXGrid(gd) { // assumes doXticks has been called recently, to set m and b
    if(typeof gd.xgrid != 'undefined') {gd.xgrid.remove();}
    var a=gd.layout.xaxis;
    gd.plot.setStart();
    for(var x=a.tmin;x<=a.range[1];x+=a.dtick){
        gd.plot.path(Raphael.format('M{0},{1}v{2}',a.m*x+a.b+gd.viewbox.x,
            gd.viewbox.y-screen.height,gd.plotheight+2*screen.height))}
    gd.xgrid=gd.plot.setFinish();
    gd.xgrid.attr({'stroke':'#ccc'}).toBack().drag(plotDrag,plotDragStart,resetViewBox,gd,gd,gd);
    gd.plotbg.toBack();
}

function doYGrid(gd) { // assumes doYticks has been called recently, to set m and b
    if(typeof gd.ygrid != 'undefined') {gd.ygrid.remove();}
    var a=gd.layout.yaxis;
    gd.plot.setStart();
    for(var x=a.tmin;x<=a.range[1];x+=a.dtick){
        gd.plot.path(Raphael.format('M{0},{1}h{2}',gd.viewbox.x-screen.width,
            a.m*x+a.b+gd.viewbox.y,gd.plotwidth+2*screen.width))}
    gd.ygrid=gd.plot.setFinish();
    gd.ygrid.attr({'stroke':'#ccc'}).toBack().drag(plotDrag,plotDragStart,resetViewBox,gd,gd,gd);
    gd.plotbg.toBack();
}

function axTitle(axis) {
    if((axis.unit=='')||(axis.unit==undefined)) return axis.title;
    else return axis.title+' ('+axis.unit+')';
}

// ----------------------------------------------------
// Graph file operations
// ----------------------------------------------------

function saveGraph(divid) {
    var gd=(typeof divid == 'string') ? document.getElementById(divid) : divid;
    if(typeof gd.fileid !='string') gd.fileid='';

    // jsonify the graph data and layout
    var data = [];
    for(d in gd.data) data.push(stripSrc(gd.data[d]));
    var gj = JSON.stringify({'layout':gd.layout,'data':data});
    
    // for now use the graph title as the filename
    var fn = gd.layout.title;

    $.post("/savegraph/", {'graph':gj, 'fid':gd.fileid, 'fn':fn}, saveGraphResp);
}

function saveGraphResp(res) {
    var resJ=JSON.parse(res);
    if(resJ.err != '') alert(resJ.err);
    if(resJ.fid != '') $("#privatetree").jstree("create", null, "last",
        {"data":resJ.fn, "attr":{"id":resJ.fid, "rel":"graph"} });
}

// return JSON for saving the graph in gd to userdata
function graphJSON(gd) {
}

// create a copy of data, with all dereferenced src elements stripped
// so if there's xsrc present, strip out x
// needs to do this recursively because some src can be inside sub-objects
// also strip "drawing" element, which is a reference to the Raphael objects
function stripSrc(d) {
    var o={};
    for(v in d) {
        if((v!='drawing') && !(v+'src' in d)) {
            if($.isPlainObject(d[v])) o[v]=stripSrc(d[v]);
            else o[v]=d[v];
        }
    }
    return o;
}