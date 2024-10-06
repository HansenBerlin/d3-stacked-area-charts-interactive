// Responsive D3.js chart script

// Global variables
let originalData;
let consoles;
let activeConsoles;
let initialRange;
let mainColor = "#2d4692";
let updateDelay = 100;
let mobileBreakpoint = 800;
let isCurrency = false;

// Load and process the data
d3.csv("NTDOY.csv").then((data) => {
  // Parse the Date and convert the Close to a number
  const parseDate = d3.timeParse("%Y-%m-%d");
  data.forEach((d) => {
    d.Date = parseDate(d.Date);
    d.Close = +d.Close;
  });

  // Store original data
  originalData = data;

  // Get list of unique consoles
  consoles = Array.from(new Set(data.map((d) => d.Console)));

  // Initialize active consoles with all consoles
  activeConsoles = consoles.slice();

  // Initial date range
  initialRange = [
    d3.min(data, (d) => d.Date),
    d3.max(data, (d) => d.Date),
  ];

  // Initial render
  renderChart();
});

// Function to render the chart
function renderChart() {
  // Remove any existing SVGs and tooltips
  d3.select("#chart-container").selectAll("svg").remove();
  d3.select("#slider-range").selectAll("svg").remove();
  d3.select("body").selectAll(".tooltip").remove();

  // Remove any existing window resize event listener
  d3.select(window).on("resize.renderChart", null);

  // Get the width of the container
  const containerWidth = document.getElementById("chart-container").offsetWidth;
  const containerHeight = window.innerHeight * 0.8; // Adjust height as needed

  // Determine if mobile layout should be used
  const isMobile = containerWidth < mobileBreakpoint;

  // Adjust margins based on isMobile
  const margin = {
    top: 70,
    right: isMobile ? 20 : 150,
    bottom: isMobile ? 100 : 50,
    left: 80,
  };
  const width = containerWidth - margin.left - margin.right;
  const height = containerHeight - margin.top - margin.bottom;

  // Create the SVG element and append it to the chart container
  const svg = d3
    .select("#chart-container")
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", containerHeight);

  // Create defs element for gradients
  const defs = svg.append("defs");

  // Create the main group element
  const mainGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create groups for layers and tooltip elements
  const layersGroup = mainGroup.append("g").attr("class", "layers-group");
  const tooltipGroup = mainGroup.append("g").attr("class", "tooltip-group");

  // Create tooltip divs
  const tooltip = d3.select("body").append("div").attr("class", "tooltip");
  const tooltipRawDate = d3.select("body").append("div").attr("class", "tooltip");

  // Set up the color scale based on a single RGB color gradient
  const baseColor = d3.rgb(mainColor);
  const colorInterpolator = d3.interpolateRgb(
    baseColor.darker(1.5),
    baseColor.brighter(1.5)
  );
  const colorScale = d3
    .scaleSequential()
    .domain([0, consoles.length - 1])
    .interpolator(colorInterpolator);

  // Map console names to colors
  const consoleColors = {};
  consoles.forEach((console, i) => {
    consoleColors[console] = colorScale(i);
  });

  // Helper function to sanitize IDs
  function sanitize(str) {
    return str.replace(/\s+/g, "-").replace(/[^\w-]/g, "");
  }

  // Create gradients for each console
  consoles.forEach((console) => {
    const color = d3.color(consoleColors[console]);
    const gradient = defs
      .append("linearGradient")
      .attr("id", `gradient-${sanitize(console)}`)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", color.brighter(1)) // Increased brightness
      .attr("stop-opacity", 1);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", color.darker(1)) // Increased darkness
      .attr("stop-opacity", 1);
  });

  // Set up the x and y scales
  const x = d3.scaleTime().range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);

  // Add the x-axis
  const xAxisGroup = mainGroup
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .style("font-size", "12px");

  // Add the y-axis
  const yAxisGroup = mainGroup
    .append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(0,0)`)
    .style("font-size", "12px");

  // Add a circle element
  const circle = tooltipGroup
    .append("circle")
    .attr("r", 0)
    .attr("fill", "red")
    .style("stroke", "white")
    .attr("opacity", 0.7)
    .style("pointer-events", "none");

  // Add red lines extending from the circle to the date and value
  const tooltipLineX = tooltipGroup
    .append("line")
    .attr("class", "tooltip-line")
    .attr("id", "tooltip-line-x")
    .attr("stroke", "red")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2,2");

  const tooltipLineY = tooltipGroup
    .append("line")
    .attr("class", "tooltip-line")
    .attr("id", "tooltip-line-y")
    .attr("stroke", "red")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2,2");

  // Function to prepare data based on aggregation interval
  function prepareData(data, interval) {
    // Group data by the specified interval and console
    const nestedData = d3.rollups(
      data,
      (v) => d3.mean(v, (d) => d.Close),
      (d) => interval(d.Date),
      (d) => d.Console
    );

    // Flatten the nested data and format it for stacking
    const dateMap = new Map();
    nestedData.forEach(([date, groups]) => {
      const dateObj = new Date(date);
      const entry = { Date: dateObj };
      groups.forEach(([console, value]) => {
        entry[console] = value;
      });
      dateMap.set(dateObj.getTime(), entry);
    });

    // Convert the map values to an array and sort by Date
    const dataReady = Array.from(dateMap.values()).sort(
      (a, b) => a.Date - b.Date
    );

    // Ensure all consoles have a value for each date
    dataReady.forEach((d) => {
      consoles.forEach((c) => {
        if (d[c] === undefined) {
          d[c] = 0;
        }
      });
    });

    return dataReady;
  }

  // Function to update the chart
  function updateChart(range, withTransition = true) {
    // Calculate the duration in days
    const durationDays = (range[1] - range[0]) / (1000 * 60 * 60 * 24);

    // Decide on aggregation interval
    let interval;
    if (durationDays > 1825) {
      interval = d3.timeYear; // >5 years
    } else if (durationDays > 365) {
      interval = d3.timeMonth; // >1 year
    } else if (durationDays > 31) {
      interval = d3.timeWeek; // >1 month
    } else {
      interval = d3.timeDay; // <=1 month
    }

    // Decide on date format for x-axis labels
    let dateFormat;
    if (interval === d3.timeYear) {
      dateFormat = d3.timeFormat("%Y");
    } else if (interval === d3.timeMonth) {
      dateFormat = d3.timeFormat("%b. %Y"); // e.g., Jan 2020
    } else {
      dateFormat = d3.timeFormat("%d. %b. %Y"); // e.g., 01 Jan 2020
    }

    // Filter data based on the range
    const filteredData = originalData.filter(
      (d) => d.Date >= range[0] && d.Date <= range[1]
    );

    // Prepare data
    const dataReady = prepareData(filteredData, interval);

    // Update x-scale domain
    x.range([0, width]).domain(d3.extent(dataReady, (d) => d.Date));

    // Generate the stacked data using active consoles
    const stack = d3.stack().keys(activeConsoles);
    const stackedData = stack(dataReady);

    // Update y-scale domain
    y.range([height, 0]);
    const yMax = d3.max(stackedData, (series) =>
      d3.max(series, (d) => d[1])
    );
    y.domain([0, yMax]);

    // Area generator with curve
    const area = d3
      .area()
      .curve(d3.curveMonotoneX)
      .x((d) => x(d.data.Date))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]));

    // Bind data to layers
    const layers = layersGroup
      .selectAll(".layer")
      .data(stackedData, (d) => d.key);

    // Handle exit selection
    layers.exit().remove();

    // Handle update selection
    layers
      .style("fill", (d) => `url(#gradient-${sanitize(d.key)})`)
      .style("stroke", "white")
      .style("stroke-width", "0.5px")
      .style("stroke-linejoin", "round");

    if (withTransition) {
      layers
        .transition()
        .duration(updateDelay)
        .attr("d", area);
    } else {
      layers.attr("d", area);
    }

    // Handle enter selection
    const newLayers = layers
      .enter()
      .append("path")
      .attr("class", "layer")
      .style("fill", (d) => `url(#gradient-${sanitize(d.key)})`)
      .style("stroke", "white")
      .style("stroke-width", "0.5px")
      .style("stroke-linejoin", "round")
      .style("pointer-events", "none");

    if (withTransition) {
      newLayers
        .attr("d", area)
        .style("fill-opacity", 0)
        .transition()
        .duration(updateDelay)
        .style("fill-opacity", 0.7);
    } else {
      newLayers
        .attr("d", area)
        .style("fill-opacity", 0.7);
    }

    // Update axes
    xAxisGroup
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(dateFormat))
      .selectAll(".tick text")
      .attr("fill", "#777");

    yAxisGroup
      .transition()
      .duration(300)
      .call(
        d3
          .axisLeft(y)
          .ticks(10)
          .tickFormat((d) => {
            if (isNaN(d)) return "";
            return isCurrency ? `${d.toFixed(2)}€` : d;
          })
      )
      .selectAll(".tick text")
      .attr("fill", "#777");

    // Remove existing listening rectangle if any
    mainGroup.selectAll(".listening-rect").remove();

    // Create a new listening rectangle on top of the areas
    const listeningRect = mainGroup
      .append("rect")
      .attr("class", "listening-rect")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all");

    // Update the listening rectangle's mousemove event
    listeningRect.on("mousemove", function (event) {
      const [xCoord] = d3.pointer(event, this);
      const x0 = x.invert(xCoord);
      const bisectDate = d3.bisector((d) => d.Date).left;
      const i = bisectDate(dataReady, x0);
      const d0 = dataReady[i - 1];
      const d1 = dataReady[i];
      let d;
      if (!d0) {
        d = d1;
      } else if (!d1) {
        d = d0;
      } else {
        d = x0 - d0.Date > d1.Date - x0 ? d1 : d0;
      }

      if (d) {
        const xPos = x(d.Date);
        const totalClose = activeConsoles.reduce(
          (sum, key) => sum + (d[key] || 0),
          0
        );
        const yPos = y(totalClose);

        // Update the circle position
        circle.attr("cx", xPos).attr("cy", yPos);

        // Add transition for the circle radius
        circle.transition().duration(50).attr("r", 5);

        // Update the position of the red lines
        tooltipLineX
          .style("display", "block")
          .attr("x1", xPos)
          .attr("x2", xPos)
          .attr("y1", yPos)
          .attr("y2", height);

        tooltipLineY
          .style("display", "block")
          .attr("y1", yPos)
          .attr("y2", yPos)
          .attr("x1", 0)
          .attr("x2", width);

        // Update the tooltip with total and individual console values
        const values = consoles
          .map((key) => {
            if (activeConsoles.includes(key)) {
              return `${key}: ${
                d[key] !== undefined ? isCurrency ? `${d[key].toFixed(2)}€` : d[key].toFixed(0) : "0"
              }`;
            } else {
              return null;
            }
          })
          .filter((v) => v !== null)
          .join("<br>");

        const total = isCurrency ? `${totalClose.toFixed(2)}€<br>${values}` : `${totalClose.toFixed(0)}<br>${values}`;
        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 15}px`)
          .style("top", `${event.pageY - 28}px`)
          .html(`Total: ${total}`);

        tooltipRawDate
          .style("display", "block")
          .style("left", `${xPos + margin.left}px`)
          .style("top", `${height + margin.top + 15}px`)
          .html(`${d3.timeFormat("%Y-%m-%d")(d.Date)}`);
      }
    });

    // Update the listening rectangle's mouseleave event
    listeningRect.on("mouseleave", function () {
      circle.transition().duration(50).attr("r", 0);
      tooltip.style("display", "none");
      tooltipRawDate.style("display", "none");
      tooltipLineX.style("display", "none");
      tooltipLineY.style("display", "none");
    });

  }

  // Initial chart rendering
  updateChart(initialRange);
  


  // Throttle function to limit updateChart calls
  function throttle(func, limit) {
    let inThrottle;
    let lastFunc;
    let lastRan;
    return function (...args) {
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        lastRan = Date.now();
        inThrottle = true;
      } else {
        clearTimeout(lastFunc);
        lastFunc = setTimeout(function () {
          if (Date.now() - lastRan >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        }, limit - (Date.now() - lastRan));
      }
    };
  }

  // Throttled version of updateChart
  const throttledUpdateChart = throttle((val) => {
    updateChart(val, false);
  }, updateDelay);

  // Define the slider
  const sliderRange = d3
    .sliderBottom()
    .min(d3.min(originalData, (d) => d.Date))
    .max(d3.max(originalData, (d) => d.Date))
    .width(width)
    .tickFormat(d3.timeFormat("%d.%m.%Y"))
    .ticks(5)
    .default(initialRange)
    .fill("#666666");

    //document.getElementByClass("handle").setAttribute("d", "M 0 0 L 0 50 L 50 50");


  // Update the chart during slider movement, throttled
  sliderRange.on("onchange", (val) => {
    throttledUpdateChart(val);
  });

  // Update the chart with transitions when slider interaction ends
  sliderRange.on("end", (val) => {
    updateChart(val, true);
  });

  // Add the slider to the DOM
  const gRange = d3
    .select("#slider-range")
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", 70)
    .append("g")
    .attr("transform", `translate(${margin.left},30)`);

  gRange.call(sliderRange);

  // Determine legend position
  let legendX, legendY;

  if (isMobile) {
    legendX = margin.left;
    legendY = margin.top + height + 30; // Added extra margin
  } else {
    legendX = margin.left + width + 20;
    legendY = margin.top;
  }

  // Create the legend
  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  const legendItemHeight = 24;
  const legendItemPadding = 8;
  const legendItemSpacing = 10;

  const legendConsoles = consoles.slice().reverse(); // Reverse the consoles for the legend

  if (isMobile) {
    let legendItemX = 0;
    let legendItemY = 0;
    const maxLegendWidth = containerWidth - margin.left - margin.right;

    legendConsoles.forEach((console) => {
      // Create temporary text to measure width
      const tempText = legend
        .append("text")
        .text(console)
        .style("font-size", "14px")
        .style("font-family", "sans-serif")
        .attr("x", 0)
        .attr("y", 0)
        .attr("visibility", "hidden");

      const textWidth = tempText.node().getComputedTextLength();
      //tempText.remove();

      const itemWidth = textWidth + legendItemPadding * 2 + legendItemSpacing;

      if (legendItemX + itemWidth > maxLegendWidth) {
        legendItemX = 0;
        legendItemY += legendItemHeight + legendItemSpacing;
      }

      const legendItem = legend
        .append("g")
        .attr("class", "legend-item")
        .style("cursor", "pointer")
        .attr("transform", `translate(${legendItemX}, ${legendItemY})`)
        .on("click", function () {
          const idx = activeConsoles.indexOf(console);
          if (idx > -1) {
            activeConsoles.splice(idx, 1);
          } else {
            const originalIndex = consoles.indexOf(console);
            activeConsoles.splice(originalIndex, 0, console);
          }

          d3.select(this)
            .select("rect")
            .style("fill", idx > -1 ? "#ccc" : consoleColors[console]);

          d3.select(this)
            .select("text")
            .style("fill", idx > -1 ? "#777" : "#fff");

          updateChart(sliderRange.value(), true);
        });

      const text = legendItem
        .append("text")
        .text(console)
        .style("font-size", "14px")
        .style("font-family", "sans-serif")
        .attr("x", legendItemPadding)
        .attr("y", legendItemHeight / 2)
        .attr("alignment-baseline", "middle")
        .style("fill", "#fff");

      // Insert rectangle behind the text
      legendItem
        .insert("rect", "text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", textWidth + legendItemPadding * 2)
        .attr("height", legendItemHeight)
        .attr("rx", legendItemHeight / 2)
        .attr("ry", legendItemHeight / 2)
        .style("fill", consoleColors[console])
        .style("fill-opacity", 0.8);

      legendItemX += itemWidth;
    });
  } else {
    let legendYPos = 0;
    legendConsoles.forEach((console) => {
      const legendItem = legend
        .append("g")
        .attr("class", "legend-item")
        .style("cursor", "pointer")
        .attr("transform", `translate(0, ${legendYPos})`)
        .on("click", function () {
          const idx = activeConsoles.indexOf(console);
          if (idx > -1) {
            activeConsoles.splice(idx, 1);
          } else {
            const originalIndex = consoles.indexOf(console);
            activeConsoles.splice(originalIndex, 0, console);
          }

          d3.select(this)
            .select("rect")
            .style("fill", idx > -1 ? "#ccc" : consoleColors[console]);

          d3.select(this)
            .select("text")
            .style("fill", idx > -1 ? "#777" : "#fff");

          updateChart(sliderRange.value(), true);
        });

      const text = legendItem
        .append("text")
        .text(console)
        .style("font-size", "14px")
        .style("font-family", "sans-serif")
        .attr("x", legendItemPadding)
        .attr("y", legendItemHeight / 2)
        .attr("alignment-baseline", "middle")
        .style("fill", "#fff");

      const textWidth = text.node().getComputedTextLength();

      legendItem
        .insert("rect", "text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", textWidth + legendItemPadding * 2)
        .attr("height", legendItemHeight)
        .attr("rx", legendItemHeight / 2)
        .attr("ry", legendItemHeight / 2)
        .style("fill", consoleColors[console])
        .style("fill-opacity", 0.8);

      legendYPos += legendItemHeight + legendItemSpacing;
    });
    
  }
  let elem = document.getElementsByClassName("handle");
    elem[0].setAttribute("d", "M 0 -9 C 4.77 -9 9 -4.77 9 0 C 9 4.77 4.77 9 0 9 C -4.77 9 -9 4.77 -9 0 C -9 -4.77 -4.77 -9 0 -9 Z");
    elem[1].setAttribute("d", "M 0 -9 C 4.77 -9 9 -4.77 9 0 C 9 4.77 4.77 9 0 9 C -4.77 9 -9 4.77 -9 0 C -9 -4.77 -4.77 -9 0 -9 Z");

  // Add window resize event listener (namespaced)
  d3.select(window).on("resize.renderChart", renderChart);
}
