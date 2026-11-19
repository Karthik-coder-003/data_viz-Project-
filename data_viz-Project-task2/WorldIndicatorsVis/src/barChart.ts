/*
Code based on https://observablehq.com/@d3/zoomable-bar-chart
*/

import * as d3 from "d3";
import { LabeledValue } from "./types";
import { hideTooltip, showTooltip } from "./tooltip";

//margine to make sure there is space for the textual labels and the axes
const marginTop = 5;
const marginRight = 50;
const marginBottom = 35;
const marginLeft = 65;



export function createBarChart(width: number, height: number, startY: number, isOrdinal: boolean, dataValues: LabeledValue[], featureName: string) {


    if ((height - marginBottom) <= marginTop) {
        console.error("Not enough vertical space to plot the bar charts");
    }
    if (dataValues.length === 0) {
        console.error("No data to plot");
    }
    for (const d of dataValues) {
        if (isNaN(d.value)) {
            console.error(`Value for ${d.label} and ${featureName} is not a number: ${d.value}`);
        }
    }

    //make the x-axis scales. We use a band scale for the x-axis to position the bars next to each other.
    const x = d3.scaleBand()
        .range([marginLeft, width - marginRight])
        .padding(0.1);
    //If it is ordinal data we keep it as is, otherwise we sort it't sort the data if is is ordinal. Use the labels for the x-axis
    if (isOrdinal) {
        x.domain(dataValues.map(d => d.label))
    } else {
        const sortedValues = d3.sort(dataValues, d => -d.value);//highest value first with "-"
        x.domain(sortedValues.map(d => d.label))
    }
    const xAxis = d3.axisBottom(x);




    //start making the y-axis. Linear scale from 0 to maxValue. svg coordinates start at the top left corner, so we need to invert the y-axis.
    const maxValue = d3.max(dataValues, d => d.value)!;
    let y = d3.scaleLinear()
        .range([height - marginBottom, marginTop])
        .domain([0, maxValue]); //use the values for the y-axis

    const yAxis = d3.axisLeft(y)
        .ticks(4); //setting a recommended amount of ticks such that the labels fit on the vertical axis


    // Create the SVG container
    const svg = d3.create("svg")
        .attr("class", "barchart")
        .attr("viewBox", [0, 0, width, height])
        .attr("width", width)
        .attr("height", height)
        .attr("y", startY)
        .attr("style", "max-width: 100%; height: auto;")



    // Append the bars.
    const bars = svg.append("g")
        .attr("class", "barchart-bars")
        .attr("fill", "steelblue")
        .selectAll("rect")
        .data(dataValues) //add in the data. Make a rectangle for each one.
        .join("rect")
        .attr("x", d => x(d.label)!) //use the x scale to position the bars
        .attr("width", x.bandwidth()) //use the x scale to set the width of the bars
        .attr("y", d => y(d.value)) //use the y scale to set the correct y-positiion ((0,0) in an svg is at the top left corner)
        .attr("height", d => y(0) - y(d.value)) //use the y scale to determine the height (start at 0). Note: For negative values, this will not work as expected.


    bars.on("mousemove", function (event, d) {
        const niceValue = d3.format(",")(d.value); //format the value grouped by thousands
        showTooltip(event.pageX, event.pageY, ` ${niceValue} ${featureName} for postcode ${d.label}`); //show tooltip on hover
    })
        .on("mouseout", function (event, d) {
            hideTooltip(); //hide tooltip when the mouse is no longer over the bar
        })
    //In case you want to change the color of the bar when moving the mouse over it. Note: mousemove triggers every time the mouse moves, so this will change the color every time.
    // .on("mouseover", function (event, d) {
    //         d3.select(this)
    //             .attr("fill", "orange"); //change color on hover
    //     }


    // Append the y-axis
    svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", `translate(${marginLeft},0)`)
        .call(yAxis)


    svg.append("text")//vertical text lebel
        .text("count")
        .attr("font-size", "12px")
        .attr("transform", `translate(14,${0+(height-marginBottom) / 2}) rotate(-90)`) //translate and rotate to the right spot
        .attr("text-anchor", "middle")

    // Append the x-axis.
    const xAxisElements = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height - marginBottom})`)
        .call(xAxis);

    xAxisElements.selectAll("text")
        .attr("font-size", "10px")
        //Rotating the labels on the x-axis to fit more labels. If you have fever bars, you can remove these lines below (or automatically decide on rotation)
        .attr("transform", "rotate(-45)") //rotate the labels so we can fit more
        .attr("text-anchor","end")
        .attr("dx", "-0.5em") //position the rotated labels on rotated axis. scales with font size automatically due to em
        .attr("dy", "0.4em")




    // Remove x-axis labels if there are too many to fit. Note that this does not make sense for ordinal data (such as postcodes). Here as an example
    const maxHorizontalLabels = Math.floor((width - marginLeft - marginRight) / 15); //15px per label, so we can fit a maximum of this many labels
    const dataCount = dataValues.length;
    if (dataCount > maxHorizontalLabels) { //if we have more bars than we can fit, we need to remove some labels
        const step = Math.ceil(dataCount / maxHorizontalLabels); //calculate the step size to remove labels
        xAxisElements.selectAll("g").filter((d, i) => i % step !== 0) //filter out the labels that are not needed
            .remove();
    }



    svg.append("text") //horizontal text label
        .text("Postcodes")
        .attr("x", width)
        .attr("y", height - marginBottom + 6)//position it next to the labels
        .attr("font-size", "12px")
        .attr("text-anchor", "end")




    return svg.node()!;
}