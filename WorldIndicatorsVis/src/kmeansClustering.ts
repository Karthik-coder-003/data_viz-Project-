import { extent, mean } from "d3";
import { DataInterface } from "./types";


// Range of values values for normalization
let rangeValueInhabitants: [number, number];
let rangeValueMaleInhabitants: [number, number];
let rangeValueFemaleInhabitants: [number, number];


export function getKMeansClusters(data: DataInterface[], k: number, maxIterations: number = 100) {

    //get the maximum values for the features to normalize the data
    rangeValueInhabitants = extent(data, d => d.inhabitants) as [number, number];
    rangeValueMaleInhabitants = extent(data, d => d.maleInhabitants) as [number, number];
    rangeValueFemaleInhabitants = extent(data, d => d.femaleInhabitants) as [number, number];

    // Initialize centroids randomly
    let centroids = initializeCentroids(data, k);
    let clusters = assignToNearestCluster(data, centroids);

    //go through the iterations
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        centroids = updateCentroids(clusters);
        clusters = assignToNearestCluster(data, centroids);
    }

    return clusters;
}

function initializeCentroids(data: DataInterface[], k: number): DataInterface[] {
    // Randomly select k data points as initial centroids 
    const shuffled = data.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, k);
}


function assignToNearestCluster(data: DataInterface[], centroids: DataInterface[]): DataInterface[][] {

    //initialize return array
    let clusterAssignment: DataInterface[][] = [];
    for (let k = 0; k < centroids.length; k++) {
        clusterAssignment[k] = [];
    }
    // Find the nearest centroid for each data point
    // and assign the point to that cluster 
    for (const point of data) {
        let minDistance = Number.MAX_VALUE;
        let nearestCentroidIndex = -1;

        for (let k = 0; k < centroids.length; k++) {
            computeDistance(point, centroids[k]);
            let distance = computeDistance(point, centroids[k]);
            if (distance < minDistance) {
                minDistance = distance;
                nearestCentroidIndex = k;
            }
        }
        clusterAssignment[nearestCentroidIndex].push(point);

    }

    return clusterAssignment;
}

function updateCentroids(clusterAssignments: DataInterface[][]) {
    let updatedCentroids: DataInterface[] = [];
    for (let k = 0; k < clusterAssignments.length; k++) {
        const newCentroid = getCentroid(clusterAssignments[k])
        updatedCentroids[k] = newCentroid;
    }
    return updatedCentroids;
}



function computeDistance(d1: DataInterface, d2: DataInterface): number {
    return computeNormalizedSquaredEuclidianDistance(d1, d2);
}

function computeNormalizedSquaredEuclidianDistance(d1: DataInterface, d2: DataInterface): number {
    // Squared distance saves computatinal cost by not needing to find a square root
    const nD1 = normalizeData(d1);
    const nD2 = normalizeData(d2);

    let distance = Math.pow(nD1.inhabitants - nD2.inhabitants, 2)
        + Math.pow(nD1.maleInhabitants - nD2.maleInhabitants, 2)
        + Math.pow(nD1.femaleInhabitants - nD2.femaleInhabitants, 2)
    return distance;
}

function normalizeData(data: DataInterface): DataInterface {
    let normalizedData = {
        postCode: data.postCode, // Postcode is not used for clustering, just for identification
        //min-max normalization for the other features
        inhabitants: (data.inhabitants - rangeValueInhabitants[0]) / (rangeValueInhabitants[1] - rangeValueInhabitants[0]),
        maleInhabitants: (data.maleInhabitants - rangeValueMaleInhabitants[0]) / (rangeValueMaleInhabitants[1] - rangeValueMaleInhabitants[0]),
        femaleInhabitants: (data.femaleInhabitants - rangeValueFemaleInhabitants[0]) / (rangeValueFemaleInhabitants[1] - rangeValueFemaleInhabitants[0])
    }
    //handle division by 0 errors.
    if (isNaN(normalizedData.inhabitants)) {
        normalizedData.inhabitants = 0;
    }
    if (isNaN(normalizedData.maleInhabitants)) {
        normalizedData.maleInhabitants = 0;
    }
    if (isNaN(normalizedData.femaleInhabitants)) {
        normalizedData.femaleInhabitants = 0;
    }
    return normalizedData;

}

function getCentroid(data: DataInterface[]): DataInterface {
    return {
        postCode: -1,
        inhabitants: mean(data, (d) => d.inhabitants)!,
        maleInhabitants: mean(data, (d) => d.maleInhabitants)!,
        femaleInhabitants: mean(data, (d) => d.femaleInhabitants)!,
    }
}