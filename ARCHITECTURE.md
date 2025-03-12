**File: temporal-db/ARCHITECTURE.md**
```markdown
# TemporalDB Architecture

This document describes the design decisions and architecture of TemporalDB.

## Core Concepts

TemporalDB was designed around several key concepts that enable efficient versioning of application data:

1. **Content-Addressable Storage**: Data is stored by its content hash, enabling deduplication and efficient storage of similar versions
2. **Merkle Trees**: Hierarchical hash trees that allow efficient comparison and partial updating
3. **Path-based Diffing**: Changes are tracked at specific paths in the data structure
4. **Branching Model**: Similar to Git, separate branches can evolve independently

## Components

### Storage Layer

The Storage class provides:

- Content-addressable object storage using IndexedDB
- Branch reference management
- Commit metadata storage
- Path utilities for working with nested objects

The storage is structured as three IndexedDB object stores:
- `objects`: Stores actual data keyed by content hash
- `refs`: Stores branch and tag references
- `commits`: Stores commit metadata with indices for efficient lookup

### Merkle Tree Implementation

The MerkleTree class:

- Builds hash trees from JavaScript objects
- Enables efficient structural sharing
- Allows retrieval of only changed portions of data
- Provides efficient comparison between object versions

Each node in the tree contains:
- A hash of its content
- The type of node (object, array, primitive)
- For objects/arrays: references to child nodes
- For primitives: the actual value

### Diff Engine

The Diff class provides:

- Generation of patches between object versions
- Application of patches to objects
- Conflict detection between diffs
- Inversion of diffs (for undo functionality)

Diffs are represented as:
- `added`: Paths and values that were added
- `modified`: Paths and values that were changed
- `deleted`: Paths that were removed

### Branch Management

The Branch class handles:

- Branch creation and switching
- Commit creation and storage
- Data retrieval for branches
- Time travel to previous states

Branches are implemented as references to commit hashes, similar to Git.

### Merge Engine

The Merge class provides:

- Three-way merging between branches
- Common ancestor detection
- Conflict identification
- Automated and manual conflict resolution

The merge algorithm:
1. Finds the common ancestor of two branches
2. Computes diffs from ancestor to both branches
3. Identifies conflicting changes
4. Automatically merges non-conflicting changes
5. Returns conflicts for manual resolution

## Design Decisions

### Why IndexedDB?

We chose IndexedDB as the storage backend because:
- It's available in all modern browsers
- It provides transactional access to data
- It supports larger datasets than localStorage
- It allows efficient key-based lookups

### Path-based vs. Full-Object Diffing

We use path-based diffing rather than full-object diffing because:
- It's more efficient for large nested objects
- It provides more precise conflict detection
- It allows for targeted updates of specific paths
- It makes conflict resolution more intuitive

### Content-Addressable Storage

Using content-addressable storage provides:
- Automatic deduplication of identical data
- Efficient storage of similar object versions
- Natural support for structural sharing
- Immutability of stored data

### Performance Considerations

Several optimizations were made for performance:
- Hash caching to avoid recalculating hashes
- Structural sharing of unchanged subtrees
- Lazy loading of data when traversing history
- Efficient indexing of commits by branch and timestamp

## Future Improvements

Potential future enhancements include:
- Garbage collection for orphaned objects
- Remote synchronization between instances
- Compression of stored data
- Customizable conflict resolution strategies