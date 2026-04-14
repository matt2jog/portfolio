import json
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import networkx as nx
import community as community_louvain # python-louvain
import os

def load_data(filepath):
    with open(filepath, 'r') as f:
         return json.load(f)

def run_clustering():
    data = load_data('script/skills_vectors.json')
    if not data:
        print("No data found.")
        return

    # Extract vectors and metadata
    ids = [d['id'] for d in data]
    names = [d['name'] for d in data]
    
    # Parse vectors (Drizzle returns vector as array in JS, maybe JSON string if raw pgvector)
    try:
        if isinstance(data[0]['embedding'], str):
            vectors = np.array([json.loads(d['embedding']) for d in data])
        else:
            vectors = np.array([d['embedding'] for d in data])
    except Exception as e:
        print("Error parsing embeddings:", e)
        return

    print(f"Loaded {len(vectors)} vectors with dimension {vectors.shape[1]}")

    # Compute similarity matrix
    sim_matrix = cosine_similarity(vectors)

    # Create graph where edge is created if similarity > threshold
    # Higher threshold = tighter communities
    threshold = 0.45
    
    G = nx.Graph()
    for i in range(len(ids)):
        G.add_node(i, id=ids[i], name=names[i])
        
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            if sim_matrix[i][j] > threshold:
                G.add_edge(i, j, weight=float(sim_matrix[i][j]))

    print(f"Graph created with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges using threshold {threshold}.")

    # Compute partition with Louvain algorithm
    partition = community_louvain.best_partition(G, weight='weight')
    
    # Form separate lists for each community
    communities = {}
    for node, comm_id in partition.items():
        if comm_id not in communities:
             communities[comm_id] = {
                 "community_id": comm_id,
                 "skills": []
             }
        communities[comm_id]["skills"].append({
            "id": ids[node],
            "name": names[node]
        })

    # Optional: generate names for the community based on the skills?
    
    # Format to list
    output = list(communities.values())
    
    output_path = 'script/skill_communities.json'
    with open(output_path, 'w') as f:
         json.dump(output, f, indent=2)

    print(f"Saved {len(output)} communities to {output_path}")

if __name__ == "__main__":
    run_clustering()
