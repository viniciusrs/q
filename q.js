const cheerio = require('cheerio');
const http = require('http');
const low = require('lowdb');
const db = low('db.json');

db.defaults({
      lastSearch: {},
      states: [
          { name: 'ACT' },
          { name: 'NSW' },
          { name: 'NT' },
          { name: 'QLD' },
          { name: 'SA' },
          { name: 'TAS' },
          { name: 'VIC' },
          { name: 'WA' }
      ],
      searchedStates: [],
      suburbs: [],
      searchedSuburbs: [],
      ads: []
  })
  .write();

function locationPath(location)
{
    let matches = location.match(/\/buy\/in\-([^\/]+)/);

    return matches[1];
}

function exists($)
{
    return !$('.noMatch').length;
}

function pageRequest(path, index, onPage, onDone)
{
    let options = {
        host: 'www.realestate.com.au',
        port: 80,
        path: `/buy/in-${path}/list-${index}`
    };

    let request = http.request(options, (res) => {
        switch (res.statusCode)
        {
            case 200: break;

            case 301:
            {
                let newPath = locationPath(res.headers.location);

                console.log(`Path '${path}' was redirected to '${newPath}'.`);

                pageRequest(newPath, index, onPage, onDone);
                return;
            }

            default:
            {
                console.log(`Error in ${path}/${index}. Retrying in two seconds.`);

                setTimeout(() => pageRequest(path, index, onPage, onDone), 2000);
                return;
            }
        }

        let content = '';

        res.on('data', (chunk) => {
            content += chunk;
        });

        res.on('end', () => {
            let $ = cheerio.load(content);

            if (!exists($))
            {
                console.log(`Limit reached for '${path}'.`);

                if (onDone)
                {
                    onDone();
                }

                return;
            }

            onPage(pageData($));
        });
    });

    request.end();
}

function parseAddress(address)
{
    let matches = address.match(/([^\s]+)\s+(.+),\s+(.+),\s+(.+)\s+(\d+)/);

    return {
        number: matches[1],
        street: matches[2],
        suburb: matches[3],
        state: matches[4],
        postcode: matches[5]
    };
}

function pageData($){
    let articles = $('article.resultBody');

    let items = [];

    articles.each(function(index, article) {
        try
        {
            let price = $('.priceText', article);
            let bed = $('.rui-icon-bed', article).next();
            let bathroom = $('.rui-icon-bath', article).next();
            let car = $('.rui-icon-car', article).next();
            let address = $('.name', article);
            let agency = $('header img', article);

            let entry = { 
                id: $(article).attr('id'),
                price: price.text(), 
                bed: bed.text(),
                bathroom: bathroom.text(),
                car: car.text(),
                address: parseAddress(address.text()),
                agency: agency.attr('alt')
            };

            items.push(entry);
        }
        catch (e)
        {
            return;
        }
    });

    return items;
}

function search(path, index)
{
    let type;

    if (!path)
    {
        let lastSearch = db.get('lastSearch').value();

        if (!lastSearch.path)
        {
            if (db.get('states').size() > 0)
            {
                type = 'state';
                path = db.get('states').first().name;
            }
            else if (db.get('suburbs').size() > 0)
            {
                type = 'suburb';
                path = db.get('suburbs').first().name;
            }
            else
            {
                console.log('Done');
            }

            index = 1;
        }
        else
        {
            path = lastSearch.path;
            index = lastSearch.index;
        }
    }

    db.get('lastSearch')
          .assign({ path, index })
          .write();

    pageRequest(path.toLowerCase(), index, data => pageReady(type, path, index, data), () => sectionDone(type, path));
}

function pageReady(type, path, index, data)
{
    // Le tudo

    search(path, (index + 1));
}

function sectionDone(type, path)
{


    switch (type)
    {
        case 'state':
        {
            db.get('states')
              .remove({ name: path })
              .write();
        }
        break;

        case 'suburb':
        {
            db.get('suburbs')
              .remove({ name: path })
              .write();
        }
        break;
    }

    search();
}
