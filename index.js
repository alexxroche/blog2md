'use strict';

/***
    Usage: blog2md b|w <BLOGGER/WordPress BACKUP XML> <OUTPUT DIR>

*/


const fs = require('fs');
const os = require('os');
const path = require('path');
const xml2js = require('xml2js');
const TurndownService = require('turndown');
var moment = require('moment');

var tds = new TurndownService({ codeBlockStyle: 'fenced', fence: '```' })

tds.addRule('wppreblock', {
    filter: ['pre'],
    replacement: function(content) {
        return '```\n' + content + '\n```'
    }
})

// console.log(`No. of arguments passed: ${process.argv.length}`);

if (process.argv.length < 5){
    // ${process.argv[1]}
    console.log(`Usage: blog2md [b|w] <BACKUP XML> <OUTPUT DIR> m|s`)
    console.log(`\t b for parsing Blogger(Blogspot) backup`);
    console.log(`\t w for parsing WordPress backup`);
    return 1;
}

var option = process.argv[2];
var inputFile =  process.argv[3];

var outputDir = process.argv[4];

var mergeComments = (process.argv[5] == 'm')?'m':'s' ;
/** Apply a fix to WordPress posts to convert newlines to paragraphs. */
var applyParagraphFix = (process.argv.indexOf('paragraph-fix') >= 0);


if (fs.existsSync(outputDir)) {
    console.log(`WARNING: Given output directory "${outputDir}" already exists. Files will be overwritten.`)
}
else{
    fs.mkdirSync(outputDir);
}


if (mergeComments == 'm'){
    console.log(`INFO: Comments requested to be merged along with posts. (m)`);
}
else{
    console.log(`INFO: Comments requested to be a separate .md file(m - default)`);
}



if( option.toLowerCase() == 'b'){
    bloggerImport(inputFile, outputDir);
}
else if(option.toLowerCase() == 'w'){
    wordpressImport(inputFile, outputDir);
}
else {
    console.log('Only b (Blogger) and w (WordPress) are valid options');
    return;
}





function wordpressImport(backupXmlFile, outputDir){
    var parser = new xml2js.Parser();

    fs.readFile(backupXmlFile, function(err, data) {
        parser.parseString(data, function (err, result) {
            if (err) {
                console.log(`Error parsing xml file (${backupXmlFile})\n${JSON.stringify(err)}`);
                return 1;
            }
            // console.dir(result);
            // console.log(JSON.stringify(result)); return;
            var posts = [];

            // try {
                posts = result.rss.channel[0].item;

                console.log(`Total Post count: ${posts.length}`);

                posts = posts.filter(function(post){
                    var status = '';
                    if(post["wp:status"]){
                        status = post["wp:status"].join('');
                    }
                    // console.log(post["wp:status"].join(''));
                    return status != "private" && status != "inherit"
                });


                // console.log(posts)
                console.log(`Post count: ${posts.length}`);

                var title = '';
                var content = '';
                var tags = [];
                var draft = false;
                var published = '';
                var comments = [];
                var fname = '';
                var markdown = '';
                var fileContent = '';
                var fileHeader = '';
                var postMaps = {};

                posts.forEach(function(post){
                    var postMap = {};

                    title = post.title[0].trim();

                    // console.log(title);

                    // if (title && title.indexOf("'")!=-1){
                    title = title.replace(/'/g, "''");
                    // }

                    draft = post["wp:status"] == "draft"
                    published = post.pubDate;
                    comments = post['wp:comment'];
                    fname = post["wp:post_name"][0] || post["wp:post_id"];
                    markdown = '';
                    // if (post.guid && post.guid[0] && post.guid[0]['_']){
                    //     fname = path.basename(post.guid[0]['_']);
                    // }
                    // console.log(comments);

                    console.log(`\n\n\n\ntitle: '${title}'`);
                    console.log(`published: '${published}'`);

                    if (comments){
                        console.log(`comments: '${comments.length}'`);
                    }

                    tags = [];

                    var categories = post.category;
                    var tagString = '';

                    if (categories && categories.length){
                        categories.forEach(function (category){
                            // console.log(category['_']);
                            tags.push(category['_']);
                        });

                        // console.log(tags.join(", "));
                        // tags = tags.join(", ");
                        tagString = 'tags: [\'' + tags.join("', '") + "']\n";
                        // console.log(tagString);
                    }

                    var pmap = {fname:'', comments:[]};
                    pmap.fname = outputDir+'/'+fname+'-comments.md';

                    fname = outputDir+'/'+fname+'.md';
                    pmap.postName = fname;
                    console.log(`fname: '${fname}'`);

                    if (post["content:encoded"]){
                        // console.log('content available');
                        var postContent = post["content:encoded"].toString();
                        if (applyParagraphFix && !/<p>/i.test(postContent)) {
                            postContent = '<p>' + postContent.replace(/(\r?\n){2}/g, '</p>\n\n<p>') + '</p>';
                        }
                        content = '<div>'+postContent+'</div>'; //to resolve error if plain text returned
                        markdown = tds.turndown(content);
                        // console.log(markdown);

                        fileHeader = `---\ntitle: '${title}'\ndate: ${published}\ndraft: ${draft}\n${tagString}---\n`;
                        fileContent = `${fileHeader}\n${markdown}`;
                        pmap.header = `${fileHeader}\n`;

                        writeToFile(fname, fileContent);

                    }

                    //comments:
                    /*
                        "wp:comment" [.each]
                            wp:comment_author[0]
                            wp:comment_author_email[0]
                            wp:comment_author_url[0]
                            wp:comment_date[0]
                            wp:comment_content[0]
                            wp:comment_approved[0] == 1
                        wp:post_id

                    */
                    var comments = post["wp:comment"] || [];
                    // console.dir(comments);
                    var anyApprovedComments = 0;
                    var ccontent = '';
                    comments.forEach(function(comment){
                        // console.log('')
                        if(comment["wp:comment_approved"].pop()){
                            anyApprovedComments = 1;

                            var cmt = {title:'', published:'', content:'', author:{}};

                            cmt.published = (comment["wp:comment_date"]?comment["wp:comment_date"].pop():'');

                            var cont = '<div>'+comment["wp:comment_content"].pop()+'</div>';
                            cmt.content = (comment["wp:comment_content"]?tds.turndown(cont):'');

                            cmt.author.name = (comment["wp:comment_author"]?comment["wp:comment_author"].pop():'');
                            cmt.author.email = (comment["wp:comment_author_email"]?comment["wp:comment_author_email"].pop():'');
                            cmt.author.url = (comment["wp:comment_author_url"]?comment["wp:comment_author_url"].pop():'');

                            ccontent += `#### [${cmt.author.name}](${cmt.author.url} "${cmt.author.email}") - ${cmt.published}\n\n${cmt.content}\n<hr />\n`;

                            pmap.comments.push(cmt);
                        }
                    });

                    //just a hack to re-use blogger writecomments method
                    if (pmap && pmap.comments && pmap.comments.length){
                        writeComments({"0": pmap});
                    }

                });

        });
    });

}






function bloggerImport(backupXmlFile, outputDir){
    var parser = new xml2js.Parser();
    // __dirname + '/foo.xml'
    fs.readFile(backupXmlFile, function(err, data) {
        parser.parseString(data, function (err, result) {
            if (err){
                console.error(`Error parsing xml file (${backupXmlFile})\n${JSON.stringify(err)}`); return 1;
            }
            // console.dir(JSON.stringify(result)); return;

            if(result.feed && result.feed.entry) {
                var contents = result.feed.entry;
                console.log(`Total no. of entries found : ${contents.length}`);
                // var i=0
                var posts = contents.filter(function(entry){
                    return entry.id[0].indexOf('.post-')!=-1 && !entry['thr:in-reply-to']
                });

                var comments = contents.filter(function(entry){
                    return entry.id[0].indexOf('.post-')!=-1 && entry['thr:in-reply-to']
                });

                /*
                // console.dir(posts);


                console.log(`Content-posts ${posts.length}`);
                console.log(`Content-Comments ${comments.length}`);
                */

                 var content = '';
                 var markdown = '';
                 var fileContent = '';
                 var fileHeader = '';
                 var postMaps = {};

                posts.forEach(function(entry){
                    var postMap = {};

                    var title = entry.title[0]['_'];
                    // title = tds.turndown(title);
                    if (title && title.indexOf("'")!=-1){
                         title = title.replace(/'/g, "''");
                    }
                    postMap.pid = entry.id[0].split('-').pop()

                    var published = entry.published;
                    var draft = 'false';
                    if (entry['app:control']) {
                        //console.log('[d] CONTROL: %o', entry['app:control']);
                        if (entry['app:control'][0]['app:draft'][0] == 'yes'){
                            draft = true
                        }else{
                            draft = entry['app:control'][0]['app:draft'][0];
                        }
                    }
                    /*
                    console.log(`title: "${title}"`);
                    console.log(`date: ${published}`);
                    console.log(`draft: ${draft}`);
                    */

                    var links = entry.link;

                    var urlLink = entry.link.filter(function(link){
                        if (draft && draft == 'false'){
                            //console.log('[d:is_draft] Published entry');
                            return link["$"].type && link["$"].rel && link["$"].rel=='alternate' && link["$"].type=='text/html'
                        }else if(link["$"].rel && link["$"].rel=='replies'){
                            return link["$"].type && link["$"].rel && link["$"].rel=='replies' && link["$"].type=='text/html'
                        }else if(link[0] && link[0]["$"].rel && link[0]["$"].rel=='replies'){
                            return link[0]["$"].type && link[0]["$"].rel && link[0]["$"].rel=='replies' && link[0]["$"].type=='text/html'
                        }else if(link && link["$"].rel && link["$"].rel=='self'){
                            //console.log('[d:self] %o', title);
                            return link["$"].type && link["$"].rel && link["$"].rel=='self' && link["$"].type=='application/atom+xml'
                        }else if(link && link["$"].rel && link["$"].rel=='edit'){
                            //console.log('[d:edit] %o', title);
                            return link["$"].type && link["$"].rel && link["$"].rel=='edit' && link["$"].type=='application/atom+xml'
                        }else{
                            if(link[0] && link[0]["$"].rel){
                                console.log('[d:is_draft] rel is bugged: %o', link[0]["$"]);
                            }else if(link[0]){
                                console.log('[d:is_draft] missing replies: %o', link[0]);
                            }else if(link && link["$"].rel){
                                console.log('[d:is_draft] turn ATOM in replies: %o', link["$"]);
                            }else{
                                console.log('[d:is_draft] LINKS bugged: %o', link);
                            }
                        }
                    });

                    var url=''
                    var data=`data: \n`
                    if (entry.updated) {
                        data = `${data}    updated: ${entry.updated}\n`;
                    }
                    var author =''
                    if (entry.author) {
                        //console.error('[DEBUG] the author is %o', entry.author)
                        if (entry.author[0]){
                            if (entry.author[0].name) {
                                author = `${author}\t\tname: ${entry.author[0].name}\n`;
                            }
                            if (entry.author[0].email) {
                                author = `${author}\t\temail: ${entry.author[0].email}\n`;
                            }
                            if (entry.author[0].uri) {
                                author = `${author}\t\turi: ${entry.author[0].uri}\n`;
                            }
                            if (entry.author[0]['gd:image']) {
                                author = `${author}\t\tthumbnail: \n`;
                                //console.log('[author.gd:image] %o', entry.author[0]['gd:image'][0]);
                                author = `${author}\t\t\tsrc: ${entry.author[0]['gd:image'][0]["$"].src}\n`;
                                author = `${author}\t\t\twidth: ${entry.author[0]['gd:image'][0]["$"].width}\n`;
                                author = `${author}\t\t\theight: ${entry.author[0]['gd:image'][0]["$"].height}\n`;
                            }
                        }
                    }

                    if (author && author.length >= 1){
                        author = `    author:\n${author}`
                        data = `${data}${author}`
                    }
                    if (entry['thr:total']){
                        data = `${data}    thr_totle: ${entry['thr:total']}\n`
                    }
                    if (entry['media:thumbnail']){
                        data = `${data}    media_thumbnail:\n`;
                        data = `${data}        url: ${entry['media:thumbnail'][0].url}\n`;
                        data = `${data}        width: ${entry['media:thumbnail'][0].width}\n`;
                        data = `${data}        height: ${entry['media:thumbnail'][0].height}\n`;
                    }

                    if (entry['georss:featurename'] || entry['georss:point'] || entry['georss:box']){
                        data = `${data}    georss:\n`;
                        if (entry['georss:featurename']){
                            data = `${data}        featurename: ${entry['georss:featurename']}\n`;
                        }
                        if (entry['georss:point']){
                            data = `${data}        point: ${entry['georss:point']}\n`;
                        }
                        if (entry['georss:box']){
                            data = `${data}        box: ${entry['georss:box']}\n`;
                        }
                    }

                    /*
                    for (var t in Object.keys(entry)){
                        if (t != 'author' && t != content){
                            console.log('  - %o', t)
                        }
                    }
                    var keys = [];
                    for (var k in entry) keys.push(k);
                    for (var t in keys){
                        console.log('  - %o', t)
                    }
                    */
                    //for (var t in Object.keys(entry)){
                    for (var t in entry){
                        if (t != 'id' &&
                            t != 'author' &&
                            t != 'content' &&
                            t != 'published' &&
                            t != 'updated' &&
                            t != 'category' &&
                            t != 'title' &&
                            t != 'link' &&
                            t != 'thr:total' &&
                            t != 'media:thumbnail' &&
                            t != 'georss:featurename' &&
                            t != 'georss:point' &&
                            t != 'georss:box' &&
                            t != 'app:control'
                            ){
                            console.error('[UNKNOWN tag] I do not know how to process  - %o: %o', t, entry[t])
                        }
                    }

                    // console.dir(urlLink[0]);
                    if (urlLink && urlLink[0] && urlLink[0]['$'] && urlLink[0]['$'].href){
                        if (draft && draft == 'false'){
                            url = urlLink[0]['$'].href;
                        }else{
                            var uri = urlLink[0]['$'].href;
                            url = uri.substring(0, uri.indexOf('#')); // strip #this_part
                        }
                        var fname = outputDir + '/' + path.basename(url);
                        fname = fname.replace('.html', '.md')
                        //console.log(fname);
                        postMap.postName = fname
                        postMap.fname = fname.replace('.md', '-comments.md');
                        postMap.comments = [];


                        if (entry.content && entry.content[0] && entry.content[0]['_']){
                            // console.log('content available');
                            content = entry.content[0]['_'];
                            markdown = tds.turndown(content);
                            // console.log(markdown);
                        }else{
                            console.error('[e] failed to locate content for ' + title)
                        }
                        var escaped_content = content.replace(/'/g, '&#39;');
                        data = `${data}    raw_content: '${escaped_content}'\n`;
                        // NOTE: we should cycle through ${entry}.keys and add them all
                        //       to ${data}

                        var tagLabel = [];
                        var tags = [];


                        tagLabel = entry.category.filter(function (tag){
                            // console.log(`tagged against :${tag['$'].term}`);
                            return tag['$'].term && tag['$'].term.indexOf('http://schemas.google')==-1;
                        });
                        //console.log(`No of category: ${entry.category.length}`);
                        tagLabel.forEach(function(tag){
                            // console.log(`tagged against :${tag['$'].term}`);
                            if (tag['$'].term.includes("[")){
                                // quote any tags that contain [
                                tags.push("'" + tag['$'].term + "'");
                            }else{
                                tags.push(tag['$'].term);
                            }
                        });


                        //console.log(`tags: \n${tags.map(a=> '- '+a).join('\n')}\n`);

                        var tagString='';

                        if(tags.length){
                            tagString=`tags: \n${tags.map(a=> '- '+a).join('\n')}\n`;
                        }

                        //console.dir(postMap);

                        //console.log("\n\n\n\n\n");

                        var alias = url.replace(/^.*\/\/[^\/]+/, '');

                        // convert tabs in the header into spaces so that liquid/cobalt doesn't balk
                        data = data.replace(/\t/g, '    ');
                        fileHeader = `---\ntitle: '${title}'\npublished_date: ${published}\nis_draft: ${draft}\npermalink: ${alias}\n${tagString}${data}---\n`;
                        fileContent = `${fileHeader}\n${markdown}`;

                        postMap.header = fileHeader;
                        postMaps[postMap.pid] = postMap;

                        writeToFile(fname, fileContent)

                    }else{
                        if (urlLink[0]){
                            if(urlLink[0]['$']){
                                console.log('[w] blog post is missing href ' + urlLink[0]['$'].href);
                            }else{
                                console.log('[$] urlLink is missing dollar');
                            }
                        //}else if (urlLink && urlLink['$'] && urlLink['$'].href){
                        //    console.log('[kk] entry urlLink is an object not an array:  %o', urlLink);
                        }else if (urlLink){
                            //process.stdout.write('[urlLink] found!');
                            //console.log('[Links] %o', links[0])
                            for (var l in urlLink){
                                console.log(' ~ %o', l)
                                if (l && l['$'] && l['$'].href){
                                    console.log('[kk] entry urlLink is an object not an array:  %o', l['$'].href);
                                }else if (l && l.href){
                                    console.log('[kj] entry urlLink is an object not an array:  %o', l.href);
                                }else{
                                    console.log('[e] entry urlLink is lacking access to a href:  %o', l);
                                    console.error('[e] entry urlLink is lacking access to a href:  %o', l);
                                }
                            }
                        }else{
                            //console.log('[d] entry is missing urlLink: %o', urlLink);
                            console.log('[d] entry is missing urlLink:');
                            var debug_missing_URLlink = entry.link.filter(function(link){
                                console.log('+ %o', link)
                            });


                        }
                    }

                });

            /*

            comments.forEach(function(entry){
                // var commentMap = {};
                var comment = {published:'', title:'', content:''};

                var postId = entry['thr:in-reply-to'][0]["$"]["source"];
                postId = path.basename(postId);

                comment.published = entry['published'][0];

                if(entry['title'][0] && entry['title'][0]["_"]){
                    comment.title = tds.turndown(entry['title'][0]["_"]);
                }

                if (entry['content'][0] && entry['content'][0]["_"]){
                    comment.content = tds.turndown(entry['content'][0]["_"]);
                }

                comment.author = {name: '', email: '', url: ''};

                if(entry['author'][0]["name"] && entry['author'][0]["name"][0]){
                    comment.author.name = entry['author'][0]["name"][0];
                }

                if (entry['author'][0]["email"] && entry['author'][0]["email"][0]){
                    comment.author.email = entry['author'][0]["email"][0];
                }

                if (entry['author'][0]["uri"] && entry['author'][0]["uri"][0]){
                    comment.author.url = entry['author'][0]["uri"][0];
                }

                postMaps[postId].comments.push(comment);
            });

            // console.log(JSON.stringify(postMaps)); return;
            writeComments(postMaps);
            */

            }
            console.log('Done');
        });
});

}


function writeComments(postMaps){

    if (mergeComments == 'm'){
        console.log('DEBUG: merge comments requested');
    }else{
        console.log('DEBUG: separate comments requested (defaulted)');
    }
    for (var pmap in postMaps){
        var comments = postMaps[pmap].comments;
        console.log(`post id: ${pmap} has ${comments.length} comments`);
        // console.dir(comments);

        if (comments.length){
            var ccontent = '';
            comments.forEach(function(comment){
                var readableDate = '<time datetime="'+comment.published+'">' + moment(comment.published).format("MMM d, YYYY") + '</time>';

                ccontent += `#### ${comment.title}\n[${comment.author.name}](${comment.author.url} "${comment.author.email}") - ${readableDate}\n\n${comment.content}\n<hr />\n`;
            });

            if (mergeComments == 'm'){
                writeToFile(postMaps[pmap].postName, `\n---\n### Comments:\n${ccontent}`, true);
            }else{
                writeToFile(postMaps[pmap].fname, `${postMaps[pmap].header}\n${ccontent}`);
            }

        }
    }
}



function writeToFile(filename, content, append=false){

    if(append){
        //console.log(`DEBUG: going to append to ${filename}`);
        try{
            fs.appendFileSync(filename, content);
            console.log(`Successfully appended to ${filename}`);
        }
        catch(err){
            console.log(`Error while appending to ${filename} - ${JSON.stringify(err)}`);
            console.dir(err);
        }

    }else{
        //console.log(`DEBUG: going to write to ${filename}`);
        try{
            fs.writeFileSync(filename, content);
            //console.log(`Successfully written to ${filename}`);
            process.stdout.write('.'); // lets reduce the noise, but show signs of life
        }
        catch(err){
            console.log(`Error while writing to ${filename} - ${JSON.stringify(err)}`);
            console.dir(err);
        }
    }

}
