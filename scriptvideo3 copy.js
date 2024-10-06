// Responsive D3.js chart script

// Global variables
let originalData;
let consoles;
let activeConsoles;
let initialRange;

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

  // Set dimensions and margins for the chart
  const margin = { top: 70, right: 150, bottom: 50, left: 80 };
  const width = containerWidth - margin.left - margin.right;
  const height = containerHeight - margin.top - margin.bottom;

  // Create the SVG element and append it to the chart container
  const svg = d3
    .select("#chart-container")
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", containerHeight);

  // Create the main group element
  const mainGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create tooltip divs
  const tooltip = d3.select("body").append("div").attr("class", "tooltip");
  const tooltipRawDate = d3.select("body").append("div").attr("class", "tooltip");

  // Set up the color scale based on a single RGB color gradient
  const baseColor = d3.rgb("#1f77b4"); // You can change this base color to any RGB color
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

  // Set up the x and y scales
  const x = d3.scaleTime().range([0, width]); // Use 'width' for the chart area
  const y = d3.scaleLinear().range([height, 0]);

  // Add the x-axis
  const xAxisGroup = mainGroup
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .style("font-size", "14px");

  // Add the y-axis
  const yAxisGroup = mainGroup
    .append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(0,0)`)
    .style("font-size", "14px");

  // Add a circle element
  const circle = mainGroup
    .append("circle")
    .attr("r", 0)
    .attr("fill", "red")
    .style("stroke", "white")
    .attr("opacity", 0.7)
    .style("pointer-events", "none");

  // Add red lines extending from the circle to the date and value
  const tooltipLineX = mainGroup
    .append("line")
    .attr("class", "tooltip-line")
    .attr("id", "tooltip-line-x")
    .attr("stroke", "red")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "2,2");

  const tooltipLineY = mainGroup
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
      (v) => d3.sum(v, (d) => d.Close),
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
    const layers = mainGroup
      .selectAll(".layer")
      .data(stackedData, (d) => d.key);

    // Handle exit selection
    layers.exit().remove();

    // Handle update selection
    if (withTransition) {
      layers
        .transition()
        .duration(300)
        .attr("d", area);
    } else {
      layers.attr("d", area);
    }

    // Handle enter selection
    const newLayers = layers
      .enter()
      .append("path")
      .attr("class", "layer")
      .style("fill", (d) => consoleColors[d.key])
      .style("pointer-events", "none");

    if (withTransition) {
      newLayers
        .attr("d", area)
        .style("fill-opacity", 0)
        .transition()
        .duration(300)
        .style("fill-opacity", 0.7);
    } else {
      newLayers
        .attr("d", area)
        .style("fill-opacity", 0.7);
    }

    // Update axes
    if (withTransition) {
      xAxisGroup
        .attr("transform", `translate(0,${height})`)
        .transition()
        .duration(300)
        .call(
          d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%Y-%m-%d"))
        )
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
              return `$${d.toFixed(2)}`;
            })
        )
        .selectAll(".tick text")
        .attr("fill", "#777");
    } else {
      xAxisGroup
        .attr("transform", `translate(0,${height})`)
        .call(
          d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%Y-%m-%d"))
        )
        .selectAll(".tick text")
        .attr("fill", "#777");

      yAxisGroup
        .call(
          d3
            .axisLeft(y)
            .ticks(10)
            .tickFormat((d) => {
              if (isNaN(d)) return "";
              return `$${d.toFixed(2)}`;
            })
        )
        .selectAll(".tick text")
        .attr("fill", "#777");
    }

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
          .attr("y1", 0)
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
              return `${key}: $${
                d[key] !== undefined ? d[key].toFixed(2) : "0.00"
              }`;
            } else {
              return null;
            }
          })
          .filter((v) => v !== null)
          .join("<br>");
        tooltip
          .style("display", "block")
          .style("left", `${event.pageX + 15}px`)
          .style("top", `${event.pageY - 28}px`)
          .html(`Total: $${totalClose.toFixed(2)}<br>${values}`);

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

    // Update the chart title position
    mainGroup
      .select(".chart-title")
      .attr("x", 0)
      .attr("y", -30);

    // Update the source credit position
    mainGroup
      .select(".source-credit")
      .attr("x", width - 110)
      .attr("y", height + margin.bottom - 7);
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
  }, 300);

  // Define the slider
  const sliderRange = d3
    .sliderBottom()
    .min(d3.min(originalData, (d) => d.Date))
    .max(d3.max(originalData, (d) => d.Date))
    .width(width)
    .tickFormat(d3.timeFormat("%Y-%m-%d"))
    .ticks(5)
    .default(initialRange)
    .fill("#85bb65");

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

  // Add the chart title
  mainGroup
    .append("text")
    .attr("class", "chart-title")
    .attr("x", 0)
    .attr("y", -30)
    .style("font-size", "20px")
    .style("font-weight", "bold")
    .style("font-family", "sans-serif")
    .text("Nintendo Co., Ltd. (NTDOY)");

  // Add the source credit
  mainGroup
    .append("text")
    .attr("class", "source-credit")
    .attr("x", width - 110)
    .attr("y", height + margin.bottom - 7)
    .style("font-size", "12px")
    .style("font-family", "sans-serif")
    .text("Source: Yahoo Finance");

  // Create the legend on the right side
  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr(
      "transform",
      `translate(${margin.left + width + 20}, ${margin.top})`
    );

  const legendItemHeight = 24;
  const legendItemPadding = 8;
  const legendItemSpacing = 10;
  let legendY = 0;

  consoles.forEach((console, index) => {
    const legendItem = legend
      .append("g")
      .attr("class", "legend-item")
      .style("cursor", "pointer")
      .attr("transform", `translate(0, ${legendY})`)
      .on("click", function () {
        // Toggle the console in activeConsoles
        const idx = activeConsoles.indexOf(console);
        if (idx > -1) {
          activeConsoles.splice(idx, 1);
        } else {
          const originalIndex = consoles.indexOf(console);
          activeConsoles.splice(originalIndex, 0, console);
        }

        // Update the legend item style
        d3.select(this)
          .select("rect")
          .style("fill", idx > -1 ? "#ccc" : consoleColors[console]);

        d3.select(this)
          .select("text")
          .style("fill", idx > -1 ? "#777" : "#fff");

        // Update the chart with transitions
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

    // Measure text width after rendering
    const textWidth = text.node().getComputedTextLength();

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
      .style("fill-opacity", 1);

    // Update legendY for next item
    legendY += legendItemHeight + legendItemSpacing;
  });

  // Add window resize event listener (namespaced)
  d3.select(window).on("resize.renderChart", renderChart);
}

// Function to make the SVG responsive
function responsivefy(svg) {
  const container = d3.select(svg.node().parentNode),
    width = parseInt(svg.style("width")),
    height = parseInt(svg.style("height")),
    aspect = width / height;

  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMinYMid");

  function resize() {
    const targetWidth = parseInt(container.style("width"));
    svg.attr("width", targetWidth);
    svg.attr("height", Math.round(targetWidth / aspect));
  }

  // Attach the resize function to the window resize event (namespaced)
  d3.select(window).on("resize.responsivefy", resize);
}
