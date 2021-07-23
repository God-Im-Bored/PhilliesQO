const axios = require("axios");
const cheerio = require("cheerio");
const siteUrl = "https://questionnaire-148920.appspot.com/swe/data.html";


module.exports = async (req, res) => {
  // initialize variables for storing: player metadata, qualifed/non-qualified data, labels for x axis, queue for players that pass QO threshold, and cumulative sum for total salary
  let metadata = [], datasets = [], xAxis = [], queue = [], totalSalary = 0;

  // initialize two object literals that keep track of qualified/non-qualifed players
  const qualified = {
    label: "Qualified",
    color: "rgb(0, 60, 255)",
    data: [],
  };

  const nonQualified = {
    label: "Non-Qualified",
    color: "rgb(255, 0, 0)",
    data: [],
  };
  datasets.push(qualified);
  datasets.push(nonQualified);

  // function that fetches data from site url/ return cheerio payload
  async function fetchSiteData(url) {
    const { data } = await axios.get(url);
    return cheerio.load(data);
  }

  // initialize variable that stores cheerio object payload of designated html tag
  const $ = await fetchSiteData(siteUrl);
  const playerRows = $("table#salaries-table tbody tr");
 
  

  // function that fetches player data from html payload (name, salary, year, level)/ return as text
  const fetchPlayerData = (elem, attr, type) => {
    let data = elem.find(`td.player-${attr}`);
    if (!data) {
      return undefined;
    }
    if (type === "currency") {
      // https://stackoverflow.com/questions/559112/how-to-convert-a-currency-string-to-a-double-with-jquery-or-javascript
      return Number(data.text().replace(/[^0-9.-]+/g, ""));
    } else if (type === "number") {
      return Number(data.text());
    }
    return data.text();
  };
  // funciton that will help format salaries
  // https://stackoverflow.com/questions/149055/how-to-format-numbers-as-currency-string
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  // iterate over cheerio object/ execute custom function for each matched element
  playerRows.each((i, elem) => {
    let player = {
      rowIndex: i,
      qualified: true,
      name: fetchPlayerData($(elem), "name"),
      salary: fetchPlayerData($(elem), "salary", "currency"),
      year: fetchPlayerData($(elem), "year", "number"),
      level: fetchPlayerData($(elem), "level"),
    };
    if (player.year !== 2016 || player.level !== "MLB") {
      return;
    }
    // change letters
    const firstLetter = player.name.charAt(0).toUpperCase();
    const sameLetter = metadata.length > 0 && metadata[metadata.length - 1].name.charAt(0).toUpperCase() === firstLetter;

    // create data point that'll be plotted/ this object literal contains x/y plot points and a label we'll use as a hover tag
    player.data = {
      index: metadata.length,
      label: player.name + ": " + formatter.format(player.salary),
      x: firstLetter + (sameLetter ? i : ""),
      y: player.salary,
    };

    metadata.push(player);
    xAxis.push(player.data.x);

    // add each player object to the queue, and each player's data points to the qualified data array, and increment our cumulative salary by each player's salary
    queue.push(player)
    qualified.data.push(player.data);
    $(elem).addClass("qualified-group");
    totalSalary += player.salary;

    // sort queue from highest to lowest salaries
    queue.sort((a, b) => {
      if (typeof a == "undefined" || a == null) {
        return 1;
      }
      if (typeof b == "undefined" || b == null) {
        return -1;
      }
      return b.salary - a.salary;
    });

    // check if your queue exceeds our QO threshold of 125 players
    if (queue.length > 125) {
      // if it does, remove the last player in the queue (lowest salary)
      const nonQPlayer = queue.pop();
      nonQPlayer.qualified = false;
      totalSalary -= nonQPlayer.salary;
      $(playerRows[nonQPlayer.rowIndex]).addClass("non");

      // remove player information from qualified dataset/ update non-qualified dataset
      delete qualified.data[nonQPlayer.data.index];
      nonQualified.data.push(nonQPlayer.data);
    }
  });

  // filter out nulls/undefined/NaN
  qualified.data = qualified.data.filter((x) => !!x);

  // calculate qualifying offer/ label for hover
  const offer = totalSalary / queue.length;
  const offerLabel = "Qualifying Offer: " + formatter.format(offer);

  // create plot line to designate QO threshold
  const line = {
    type: "line",
    label: offerLabel,
    color: "rgb(255, 222, 0)",
    fill: false,
    showLine: true,
    data: [
      {
        label: offerLabel,
        x: xAxis[0],
        y: offer,
      },
      {
        label: offerLabel,
        x: xAxis[xAxis.length - 1],
        y: offer,
      },
    ],
  };
  datasets.push(line);

  // return data to template/ deconstruct each property in handlebars file to retrieve value
  res.render("index", {
    title: "Phillies",
    year: 2016,
    chartData: JSON.stringify({
      datasets,
      xAxis,
    }),
    salaryTable: $("table#salaries-table"),
    misc: $("table#salaries-table tbody tr"),
  });
};


